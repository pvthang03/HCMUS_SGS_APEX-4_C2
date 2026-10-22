import { randomBytes } from 'crypto';
import { evaluateTier, getPolicy, type Action, type TierEvaluation } from '../policy/policyEngine.js';
import {
  actionDigest,
  approvalPath,
  verifyApprovalEvidence,
  type ApprovalEvidence,
  type VerifiedApproval
} from './evidence.js';

export interface Proposer {
  kind: 'agent' | 'user';
  username: string;
  sub?: string;
  /** e.g. "demo/poisoned-invoice.txt" — shown to approvers so they know what they are signing. */
  source?: string;
}

/**
 * A proposal is a queue entry, nothing more. It holds the action and the approval evidence
 * collected so far; it cannot authorise anything. The bank and the policy store re-verify the
 * evidence themselves before acting, so a bug or a malicious edit here cannot move money.
 */
export interface Proposal {
  id: string;
  action: Action;
  digest: string;
  evaluation: TierEvaluation;
  proposer: Proposer;
  status: 'PENDING' | 'REJECTED' | 'EXECUTED';
  approvals: VerifiedApproval[];
  evidence: ApprovalEvidence[];
  rejections: Array<{ username: string; reason: string; at: string }>;
  createdAt: string;
  updatedAt: string;
  executionResult?: unknown;
}

export class ApprovalError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const proposals = new Map<string, Proposal>();

type ActionInput =
  | Omit<Extract<Action, { kind: 'PAYMENT' }>, 'proposalId' | 'nonce'>
  | Omit<Extract<Action, { kind: 'CHANGE_POLICY' }>, 'proposalId' | 'nonce'>;

export function createProposal(input: ActionInput, proposer: Proposer): Proposal {
  const id = 'prop_' + randomBytes(6).toString('hex');
  const action = { ...input, proposalId: id, nonce: randomBytes(12).toString('hex') } as Action;
  const now = new Date().toISOString();
  const p: Proposal = {
    id,
    action,
    digest: actionDigest(action),
    evaluation: evaluateTier(action, getPolicy()),
    proposer,
    status: 'PENDING',
    approvals: [],
    evidence: [],
    rejections: [],
    createdAt: now,
    updatedAt: now
  };
  proposals.set(id, p);
  return p;
}

export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

/** Client view: evidence tokens never leave the server. */
export function publicView(p: Proposal) {
  const { evidence, ...rest } = p;
  return {
    ...rest,
    approvalPath: approvalPath(p.id, p.digest),
    evidenceCount: evidence.length
  };
}

export function listProposals() {
  return [...proposals.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicView);
}

/**
 * Record the evidence carried by an authenticated approve request. The request's own token and
 * DPoP proof ARE the evidence, verified with the same function the bank uses.
 */
export async function recordApproval(
  id: string,
  digest: string,
  evidence: ApprovalEvidence
): Promise<Proposal> {
  const p = proposals.get(id);
  if (!p) throw new ApprovalError(404, 'Proposal not found.');
  if (p.status !== 'PENDING') throw new ApprovalError(409, `Proposal is ${p.status}.`);
  if (digest !== p.digest) {
    throw new ApprovalError(409, 'Approval signs a different action digest than this proposal.');
  }

  let v: VerifiedApproval;
  try {
    v = await verifyApprovalEvidence(evidence, { proposalId: id, digest, maxAgeSeconds: 120 });
  } catch (e: any) {
    throw new ApprovalError(403, e.message);
  }
  if (p.proposer.sub && v.sub === p.proposer.sub) {
    throw new ApprovalError(403, 'The proposer cannot approve their own proposal.');
  }
  if (p.approvals.some((a) => a.sub === v.sub)) {
    throw new ApprovalError(409, `${v.username} has already approved; a second approval does not count.`);
  }

  p.approvals.push(v);
  p.evidence.push(evidence);
  p.updatedAt = new Date().toISOString();
  return p;
}

export function rejectProposal(id: string, username: string, reason: string): Proposal {
  const p = proposals.get(id);
  if (!p) throw new ApprovalError(404, 'Proposal not found.');
  if (p.status !== 'PENDING') throw new ApprovalError(409, `Proposal is ${p.status}.`);
  p.rejections.push({ username, reason: reason || 'Rejected', at: new Date().toISOString() });
  p.status = 'REJECTED';
  p.updatedAt = new Date().toISOString();
  return p;
}

export function markExecuted(p: Proposal, result: unknown) {
  p.status = 'EXECUTED';
  p.executionResult = result;
  p.updatedAt = new Date().toISOString();
}
