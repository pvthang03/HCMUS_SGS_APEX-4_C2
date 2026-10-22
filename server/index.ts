import express, { type Response } from 'express';
import { withAuth, withRole, type AuthenticatedRequest } from './auth/protect.js';
import { loadTideConfig } from './auth/tidecloakConfig.js';
import { hasRole } from './auth/tideJWT.js';
import {
  applyAmendment,
  getAmendmentHistory,
  getPolicy,
  loadPolicy,
  type Action,
  type Policy
} from './policy/policyEngine.js';
import {
  ApprovalError,
  createProposal,
  getProposal,
  listProposals,
  markExecuted,
  publicView,
  recordApproval,
  rejectProposal
} from './approvals/approvalManager.js';
import { mockBank, BankRefusal } from './treasury/mockBank.js';
import { getAgentLogs, logAction } from './agent/agentGateway.js';
import { quartermasterAgent } from './agent/quartermaster.js';
import seedData from './data/seed.json' with { type: 'json' };

try {
  process.loadEnvFile('.env');
} catch {
  // .env is optional; CLIENT_APP_URL falls back to http://localhost:5173
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
app.use(express.json());

function fail(res: Response, e: any) {
  const status = e instanceof ApprovalError ? e.status : e instanceof BankRefusal ? 403 : 400;
  res.status(status).json({ error: e.name || 'Error', message: e.message, details: e.details });
}

app.get('/api/health', (_req, res) => {
  const cfg = loadTideConfig();
  res.json({ status: 'ONLINE', realm: cfg.realm, tidecloak: cfg['auth-server-url'], appUrl: process.env.CLIENT_APP_URL });
});

// Every route below verifies the TideCloak access token (realm VVK) and the DPoP proof.
app.use('/api', withAuth);

app.get('/api/me', (req: AuthenticatedRequest, res) => {
  const u = req.user!;
  res.json({
    sub: u.id,
    username: u.username,
    role: u.role,
    roles: ['approver', 'moderator', 'member'].filter((r) => hasRole(u.payload, r))
  });
});

app.get('/api/policy', (_req, res) => {
  res.json({ policy: getPolicy(), amendments: getAmendmentHistory() });
});

app.get('/api/treasury/status', (_req, res) => {
  res.json({
    balance: mockBank.getBalance(),
    currency: 'CREDITS',
    transactions: mockBank.getTransactions(),
    vendors: seedData.vendors,
    invoices: seedData.invoices
  });
});

app.get('/api/approvals', (_req, res) => {
  res.json(listProposals());
});

// The approve request itself is the evidence: its token + DPoP proof sign this exact URL.
app.post('/api/approvals/:id/approve/:digest', async (req: AuthenticatedRequest, res) => {
  const u = req.user!;
  try {
    const p = await recordApproval(String(req.params.id), String(req.params.digest), {
      accessToken: u.token,
      dpopProof: u.dpopProof
    });
    res.json(publicView(p));
  } catch (e: any) {
    logAction({
      actor: u.username,
      tool: 'approve',
      actionSummary: `${u.username} (${u.role}) tried to approve ${String(req.params.id)} → REFUSED`,
      status: 'BLOCKED',
      enforcedBy: 'Approval evidence verifier (Tide token roles)',
      details: { reason: e.message }
    });
    fail(res, e);
  }
});

app.post('/api/approvals/:id/reject', withRole('approver'), (req: AuthenticatedRequest, res) => {
  try {
    res.json(publicView(rejectProposal(String(req.params.id), req.user!.username, req.body?.reason)));
  } catch (e) {
    fail(res, e);
  }
});

// Anyone may ask for execution. Authority comes only from the evidence, which is re-verified.
app.post('/api/approvals/:id/execute', async (req: AuthenticatedRequest, res) => {
  const p = getProposal(String(req.params.id));
  if (!p) return res.status(404).json({ message: 'Proposal not found.' });
  if (p.status !== 'PENDING') return res.status(409).json({ message: `Proposal is ${p.status}.` });
  try {
    const result =
      p.action.kind === 'PAYMENT'
        ? await mockBank.execute(p.action, p.evidence)
        : { policyVersion: p.action.newPolicy.version, approvers: (await applyAmendment({ action: p.action, evidence: p.evidence })).map((a) => a.username) };
    markExecuted(p, result);
    logAction({
      actor: req.user!.username,
      tool: 'execute',
      actionSummary: `Executed ${p.id} (${p.evaluation.tierName}) with ${p.approvals.length} Tide-signed approval(s)`,
      status: 'EXECUTED',
      tier: p.evaluation.tier,
      enforcedBy: p.action.kind === 'PAYMENT' ? 'Bank verifier' : 'Policy store verifier',
      details: result
    });
    res.json(publicView(p));
  } catch (e: any) {
    logAction({
      actor: req.user!.username,
      tool: 'execute',
      actionSummary: `Execution of ${p.id} refused`,
      status: 'BLOCKED',
      tier: p.evaluation.tier,
      enforcedBy: p.action.kind === 'PAYMENT' ? 'Bank verifier' : 'Policy store verifier',
      details: { reason: e.message, ...(e.details || {}) }
    });
    fail(res, e);
  }
});

// Raw bank access for anyone holding a session: what a rogue admin would call directly.
app.post('/api/treasury/execute', async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await mockBank.execute(req.body?.action as Action, req.body?.evidence || []));
  } catch (e) {
    fail(res, e);
  }
});

app.post('/api/policy/propose', (req: AuthenticatedRequest, res) => {
  const u = req.user!;
  const current = getPolicy();
  const limit = Number(req.body?.tier1MaxAmountExclusive);
  if (!Number.isFinite(limit) || limit <= 0) return res.status(400).json({ message: 'tier1MaxAmountExclusive must be > 0' });
  const newPolicy: Policy = structuredClone(current);
  newPolicy.version = current.version + 1;
  newPolicy.name = `Leashed Treasury Policy v${newPolicy.version}`;
  newPolicy.tiers['1'].maxAmountExclusive = limit;
  const p = createProposal(
    {
      kind: 'CHANGE_POLICY',
      basePolicyVersion: current.version,
      newPolicy,
      summary: `Tier 1 limit ${current.tiers['1'].maxAmountExclusive} → ${limit} credits`
    },
    { kind: 'user', username: u.username, sub: u.id }
  );
  logAction({
    actor: u.username,
    tool: 'propose_policy_change',
    actionSummary: `${u.username} proposed: Tier 1 limit → ${limit} credits (needs ${p.evaluation.requiredApprovers} approvals)`,
    status: 'PROPOSAL_SUBMITTED',
    tier: 3,
    details: { proposalId: p.id }
  });
  res.json(publicView(p));
});

/**
 * Rogue-moderator scenario. Each attempt goes through the real code path with the caller's
 * own credentials; the responses below are whatever the verifiers actually said.
 */
app.post('/api/attacks/rogue-admin', async (req: AuthenticatedRequest, res) => {
  const u = req.user!;
  const ownEvidence = [{ accessToken: u.token, dpopProof: u.dpopProof }];
  const attempts: Array<{ attempt: string; blocked: boolean; reason: string }> = [];

  const record = (attempt: string, blocked: boolean, reason: string) => {
    attempts.push({ attempt, blocked, reason });
    logAction({
      actor: u.username,
      tool: 'rogue_admin',
      actionSummary: `${attempt} → ${blocked ? 'REFUSED' : 'ALLOWED'}`,
      status: blocked ? 'BLOCKED' : 'EXECUTED',
      enforcedBy: attempt.startsWith('Lower') ? 'Policy store verifier' : 'Bank verifier',
      details: { reason }
    });
  };

  try {
    const tx = await mockBank.execute(
      { kind: 'PAYMENT', proposalId: 'admin-direct', nonce: 'admin-' + Date.now(), invoiceId: 'none', amount: 500, payee: u.username },
      ownEvidence
    );
    record('Call the bank directly: pay 500 credits to myself', false, `settled ${tx.id}`);
  } catch (e: any) {
    record('Call the bank directly: pay 500 credits to myself', true, e.message);
  }

  try {
    const current = getPolicy();
    const newPolicy: Policy = structuredClone(current);
    newPolicy.version = current.version + 1;
    newPolicy.tiers['1'].maxAmountExclusive = 1000;
    await applyAmendment({
      action: {
        kind: 'CHANGE_POLICY',
        proposalId: 'admin-direct-policy',
        nonce: 'admin-' + Date.now(),
        basePolicyVersion: current.version,
        newPolicy,
        summary: 'Tier 1 limit → 1000'
      },
      evidence: ownEvidence
    });
    record('Lower the Tier 1 limit to 1000 credits without the council', false, 'policy changed');
  } catch (e: any) {
    record('Lower the Tier 1 limit to 1000 credits without the council', true, e.message);
  }

  res.json({ actor: u.username, role: u.role, attempts });
});

app.get('/api/agent/logs', (_req, res) => {
  res.json(getAgentLogs());
});

app.post('/api/agent/run/:scenario', async (req, res) => {
  try {
    const s = req.params.scenario;
    if (s === 'normal') return res.json(quartermasterAgent.runNormalWork());
    if (s === 'poisoned') return res.json(await quartermasterAgent.runPoisonedInvoice());
    if (s === 'quorum') return res.json(quartermasterAgent.runQuorumPayment());
    res.status(404).json({ message: 'Unknown scenario' });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

await loadPolicy();
app.listen(PORT, () => {
  console.log(`[Leashed] API on http://localhost:${PORT} — TideCloak ${loadTideConfig()['auth-server-url']}`);
});
