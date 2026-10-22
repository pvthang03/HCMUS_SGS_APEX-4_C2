import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import genesisPolicy from '../data/policy.json' with { type: 'json' };
import seedData from '../data/seed.json' with { type: 'json' };
import { actionDigest, countQuorum, type ApprovalEvidence } from '../approvals/evidence.js';

export type Policy = typeof genesisPolicy;

export interface PaymentAction {
  kind: 'PAYMENT';
  proposalId: string;
  nonce: string;
  invoiceId: string;
  amount: number;
  payee: string;
}

export interface PolicyChangeAction {
  kind: 'CHANGE_POLICY';
  proposalId: string;
  nonce: string;
  basePolicyVersion: number;
  newPolicy: Policy;
  summary: string;
}

export type Action = PaymentAction | PolicyChangeAction;

export interface TierEvaluation {
  tier: 0 | 1 | 2 | 3;
  tierName: string;
  requiredApprovers: number;
}

export interface PolicyAmendment {
  action: PolicyChangeAction;
  evidence: ApprovalEvidence[];
}

function amendmentsPath() {
  return join(process.env.LEASHED_STATE_DIR || join(process.cwd(), 'data', 'state'), 'policy-amendments.json');
}

export function isVendorApproved(payee: string): boolean {
  const n = payee.toLowerCase().trim();
  return seedData.vendors.some(
    (v) => (v.id.toLowerCase() === n || v.name.toLowerCase() === n) && v.status === 'APPROVED'
  );
}

export function evaluateTier(action: Action, policy: Policy): TierEvaluation {
  const t = policy.tiers;
  if (action.kind === 'CHANGE_POLICY') {
    return { tier: 3, tierName: t['3'].name, requiredApprovers: t['3'].requiredApprovers };
  }
  if (action.amount > 0 && action.amount < t['1'].maxAmountExclusive && isVendorApproved(action.payee)) {
    return { tier: 1, tierName: t['1'].name, requiredApprovers: t['1'].requiredApprovers };
  }
  return { tier: 2, tierName: t['2'].name, requiredApprovers: t['2'].requiredApprovers };
}

/** Structural floor: no amendment may remove the human quorum entirely. */
function validatePolicyShape(p: Policy): void {
  const t = p.tiers;
  if (t['1'].requiredApprovers < 1 || t['2'].requiredApprovers < 2 || t['3'].requiredApprovers < 2) {
    throw new Error('Policy would drop a tier below its minimum quorum (1 / 2 / 2).');
  }
}

/**
 * Verify one amendment against the policy it replaces. Shared by load-time replay and by
 * applyAmendment, so a restart enforces exactly what the live path enforced.
 */
async function verifyAmendment(current: Policy, a: PolicyAmendment, maxAgeSeconds?: number) {
  if (a.action.basePolicyVersion !== current.version) {
    throw new Error(`Amendment targets policy v${a.action.basePolicyVersion}, current is v${current.version}.`);
  }
  if (a.action.newPolicy.version !== current.version + 1) {
    throw new Error('Amendment must bump the policy version by exactly one.');
  }
  validatePolicyShape(a.action.newPolicy);
  const required = evaluateTier(a.action, current).requiredApprovers;
  const { approvers, rejected } = await countQuorum(a.evidence, {
    proposalId: a.action.proposalId,
    digest: actionDigest(a.action),
    maxAgeSeconds
  });
  if (approvers.length < required) {
    throw new Error(
      `Policy change needs ${required} approver-signed approvals, has ${approvers.length}.` +
        (rejected.length ? ` Rejected: ${rejected.join('; ')}` : '')
    );
  }
  return approvers;
}

let currentPolicy: Policy = genesisPolicy;
let amendments: PolicyAmendment[] = [];

/**
 * Rebuild the policy from the genesis file in git plus every amendment on disk, re-verifying
 * each amendment's approval evidence. A tampered or unapproved amendment stops the replay, so
 * editing the state file can only ever fall back to an older, stricter-or-equal policy.
 */
export async function loadPolicy(): Promise<void> {
  currentPolicy = genesisPolicy;
  amendments = [];
  const path = amendmentsPath();
  if (!existsSync(path)) return;
  const stored: PolicyAmendment[] = JSON.parse(readFileSync(path, 'utf-8'));
  for (const a of stored) {
    try {
      await verifyAmendment(currentPolicy, a);
      currentPolicy = a.action.newPolicy;
      amendments.push(a);
    } catch (e: any) {
      console.warn(`[policy] Ignoring amendment ${a.action?.proposalId}: ${e.message}`);
      break;
    }
  }
}

export function getPolicy(): Policy {
  return currentPolicy;
}

export function getAmendmentHistory() {
  return amendments.map((a) => ({
    proposalId: a.action.proposalId,
    version: a.action.newPolicy.version,
    summary: a.action.summary,
    approvals: a.evidence.length
  }));
}

export async function applyAmendment(a: PolicyAmendment) {
  const approvers = await verifyAmendment(currentPolicy, a, 3600);
  currentPolicy = a.action.newPolicy;
  amendments.push(a);
  const path = amendmentsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(amendments, null, 2));
  return approvers;
}
