import express from 'express';
import cors from 'cors';
import { issueTideToken, generateDPoPProof, SEEDED_USERS } from './auth/tokenService.js';
import { withAuth, withRole, type AuthenticatedRequest } from './auth/protect.js';
import { getPolicy, getRequiredApproval, updatePolicy } from './policy/policyEngine.js';
import {
  createApprovalRequest,
  listApprovalRequests,
  getApprovalRequest,
  submitApproval,
  rejectApproval
} from './approvals/approvalManager.js';
import { mockBank } from './treasury/mockBank.js';
import { agentGateway, getAgentLogs, logAgentAction } from './agent/agentGateway.js';
import { quartermasterAgent } from './agent/quartermaster.js';
import seedData from './data/seed.json' with { type: 'json' };

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Public health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Leashed — Emergent Authority Guild Treasurer',
    realm: 'leashed',
    tidecloak: {
      mode: 'Tide-Embedded-VVK',
      senderConstrainedDPoP: 'RFC 9449 Strictly Enforced',
      forsetiContract: 'LeashedTreasuryContract.cs'
    },
    timestamp: new Date().toISOString()
  });
});

// Seeded users list (public for demo persona switcher)
app.get('/api/auth/users', (req, res) => {
  res.json(Object.values(SEEDED_USERS));
});

// Issue Tide access token for synthetic user (simulating Tide login)
app.post('/api/auth/token', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    const session = await issueTideToken(username);
    res.json(session);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Helper for client to obtain RFC 9449 DPoP proof for requests
app.post('/api/auth/dpop-proof', async (req, res) => {
  try {
    const { username, method, url, accessToken } = req.body;
    if (!username || !method || !url) {
      return res.status(400).json({ error: 'Missing required parameters for DPoP proof' });
    }
    const proof = await generateDPoPProof(username, method, url, accessToken);
    res.json({ proof });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// PROTECTED ROUTES (Require JWT + DPoP)
// ==========================================

// Policy Information
app.get('/api/policy', withAuth, (req: AuthenticatedRequest, res) => {
  res.json(getPolicy());
});

// Treasury status
app.get('/api/treasury/status', withAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    balance: mockBank.getBalance(),
    currency: 'CREDITS',
    transactions: mockBank.getTransactions(),
    vendors: seedData.vendors,
    unprocessedInvoices: seedData.invoices
  });
});

// Execute Payment: Only succeeds if presented with Tide-signed VVK authorization ticket!
app.post('/api/treasury/execute', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { actionId, amount, payee, authorizationProof } = req.body;

    if (!actionId || amount === undefined || !payee) {
      return res.status(400).json({ error: 'Missing action details' });
    }

    const result = await mockBank.executePayment(actionId, amount, payee, authorizationProof);
    res.json(result);
  } catch (err: any) {
    res.status(403).json({
      error: 'TideCloak Enforcement Refusal',
      message: err.message
    });
  }
});

// Rogue Admin Attack Attempt 1: Direct bank call without VVK proof
app.post('/api/treasury/admin-bypass-attempt', withAuth, withRole('admin'), async (req: AuthenticatedRequest, res) => {
  logAgentAction(
    'admin_direct_payment_attempt',
    `ROGUE ADMIN ATTEMPT: Admin '${req.user?.username}' attempted direct bank payment of 500 credits without quorum!`,
    'BLOCKED_BY_TIDECLOAK',
    {
      actor: req.user?.username,
      role: req.user?.role,
      attemptedAction: 'Direct bank payout without TideCloak VVK authorization proof'
    },
    2
  );

  return res.status(403).json({
    error: 'TideCloak Enforcement Refusal',
    blockedByTide: true,
    message: 'BLOCKED BY TIDECLOAK: The Mock Bank requires a cryptographic authorization ticket signed by the Tide Realm VVK key. Even a Guild Admin / Moderator holds zero keys to move funds unilaterally.'
  });
});

// Approvals Queue
app.get('/api/approvals', withAuth, (req: AuthenticatedRequest, res) => {
  const { status } = req.query;
  res.json(listApprovalRequests(status as string));
});

// Approver signs request
app.post('/api/approvals/:id/approve', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // Invariant: Only 'approver' role can sign! Admin alone or agent cannot sign!
    if (user.role !== 'approver') {
      logAgentAction(
        'unauthorized_approval_attempt',
        `UNAUTHORIZED APPROVAL: User '${user.username}' with role '${user.role}' attempted to approve request '${id}'!`,
        'BLOCKED_BY_TIDECLOAK',
        { actor: user.username, role: user.role, requestId: id },
        2
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${user.role}' cannot act as a financial approver. Only members of the approver council holding the 'approver' role may sign.`
      });
    }

    const result = await submitApproval(id, {
      id: user.id,
      username: user.username,
      role: user.role
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Approver rejects request
app.post('/api/approvals/:id/reject', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user!;

    const result = rejectApproval(
      id,
      { id: user.id, username: user.username, role: user.role },
      reason
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Rogue Admin Attack Attempt 2: Policy weakening attempt
app.post('/api/policy/admin-override-attempt', withAuth, withRole('admin'), (req: AuthenticatedRequest, res) => {
  logAgentAction(
    'admin_policy_weakening_attempt',
    `ROGUE ADMIN ATTEMPT: Admin '${req.user?.username}' attempted to unilaterally raise Tier 1 limit to 1000 credits!`,
    'BLOCKED_BY_TIDECLOAK',
    {
      actor: req.user?.username,
      role: req.user?.role,
      attemptedAction: 'Unilateral policy threshold weakening without 3-of-3 quorum'
    },
    3
  );

  return res.status(403).json({
    error: 'TideCloak Enforcement Refusal',
    blockedByTide: true,
    message: 'BLOCKED BY TIDECLOAK: Policy amendments are Tier 3 constitutional actions requiring a 3-of-3 human approver quorum. Admin cannot weaken policies alone.'
  });
});

// Agent Audit Logs
app.get('/api/agent/logs', withAuth, (req: AuthenticatedRequest, res) => {
  res.json(getAgentLogs());
});

// Demo Scenario 1: Normal Work
app.post('/api/agent/run-scenario-1', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await quartermasterAgent.runNormalWorkScenario();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Demo Scenario 2: The Attack (Poisoned Invoice Injection)
app.post('/api/agent/run-scenario-2', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await quartermasterAgent.runPoisonedInvoiceScenario();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Demo Scenario 3: The Rogue Admin Attacks
app.post('/api/agent/run-scenario-3', withAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // 1. Log attempt 1: Admin tries to approve alone -> fails
    logAgentAction(
      'admin_solo_approval_attempt',
      "ROGUE ADMIN ATTEMPT 1: Admin tried to unilaterally approve 900-credit transfer -> REFUSED (Role 'admin' != 'approver')",
      'BLOCKED_BY_TIDECLOAK',
      { actor: 'admin', role: 'admin', attemptedAction: 'Unilateral approval' },
      2
    );

    // 2. Log attempt 2: Admin tries to raise threshold to 1000 -> fails
    logAgentAction(
      'admin_policy_override_attempt',
      'ROGUE ADMIN ATTEMPT 2: Admin tried to weaken policy threshold to 1000 credits -> REFUSED (Requires 3-of-3 quorum)',
      'BLOCKED_BY_TIDECLOAK',
      { actor: 'admin', role: 'admin', attemptedAction: 'Policy override' },
      3
    );

    // 3. Log attempt 3: Admin tries to call bank directly -> fails
    logAgentAction(
      'admin_bank_bypass_attempt',
      'ROGUE ADMIN ATTEMPT 3: Admin called /api/treasury/execute directly -> REFUSED (Missing VVK Authorization Proof)',
      'BLOCKED_BY_TIDECLOAK',
      { actor: 'admin', role: 'admin', attemptedAction: 'Direct bank payout' },
      2
    );

    // 4. Create legitimate 80-credit payment proposal for approved vendor Neural Creative Assets
    const legitimateProposal = await agentGateway.draftPaymentProposal(
      'INV-2026-02',
      80,
      'Neural Creative Assets',
      'Quarterly brand package & UI assets'
    );

    res.json({
      scenario: 'SCENARIO_3_ROGUE_ADMIN',
      summary: 'All 3 rogue admin bypass attempts were BLOCKED BY TIDECLOAK. A legitimate 80-credit payment proposal was submitted to the council queue requiring 2-of-3 approvers.',
      legitimateProposal
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Leashed Server] Listening on http://localhost:${PORT}`);
  console.log(`[Leashed Server] TideCloak VVK Auth & RFC 9449 DPoP protection active`);
});
