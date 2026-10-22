import { createHash } from 'crypto';
import { SignJWT, importJWK, type JWK } from 'jose';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getRequiredApproval, type ActionRequest, type PolicyTierEvaluation } from '../policy/policyEngine.js';

// Load VVK private key for Realm authority token signing
const vvkPath = join(process.cwd(), 'server', 'data', 'tide-vvk-private.json');
const vvkPrivJwk: JWK = JSON.parse(readFileSync(vvkPath, 'utf-8'));

export interface ApprovalRecord {
  id: string;
  action: ActionRequest;
  evaluation: PolicyTierEvaluation;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED';
  proposerId: string;
  proposerUsername: string;
  proposerRole: string;
  approvals: Array<{
    approverId: string;
    approverUsername: string;
    approvedAt: string;
  }>;
  rejections: Array<{
    approverId: string;
    approverUsername: string;
    reason: string;
    rejectedAt: string;
  }>;
  requiredApprovals: number;
  currentApprovals: number;
  nonce: string;
  authorizationProof?: string;
  createdAt: string;
  updatedAt: string;
  executionResult?: any;
}

// In-memory store for approval requests
const approvalStore = new Map<string, ApprovalRecord>();

/**
 * Compute canonical hash of action payload bound to nonce
 */
export function computeActionHash(actionId: string, amount: number, payee: string, nonce: string): string {
  const data = `${actionId}:${amount}:${payee}:${nonce}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create a new approval request
 */
export function createApprovalRequest(
  action: ActionRequest,
  proposer: { id: string; username: string; role: string }
): ApprovalRecord {
  const evaluation = getRequiredApproval(action);
  const id = 'cr_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  const nonce = 'nonce_' + createHash('sha256').update(id + Date.now()).digest('hex').substring(0, 16);

  const record: ApprovalRecord = {
    id,
    action,
    evaluation,
    status: 'PENDING',
    proposerId: proposer.id,
    proposerUsername: proposer.username,
    proposerRole: proposer.role,
    approvals: [],
    rejections: [],
    requiredApprovals: evaluation.requiredApprovers,
    currentApprovals: 0,
    nonce,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  approvalStore.set(id, record);
  return record;
}

export function listApprovalRequests(status?: string): ApprovalRecord[] {
  const all = Array.from(approvalStore.values());
  if (status) {
    return all.filter((r) => r.status === status);
  }
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getApprovalRequest(id: string): ApprovalRecord | undefined {
  return approvalStore.get(id);
}

/**
 * Record an approval from a user
 */
export async function submitApproval(
  requestId: string,
  approver: { id: string; username: string; role: string }
): Promise<{ success: boolean; message: string; record: ApprovalRecord }> {
  const record = approvalStore.get(requestId);
  if (!record) {
    throw new Error('Approval request not found');
  }

  if (record.status !== 'PENDING') {
    throw new Error(`Cannot approve request in status '${record.status}'`);
  }

  // Invariant 1: Approver role check
  if (approver.role !== 'approver') {
    throw new Error(
      `Role '${approver.role}' is not authorized to act as an approver. Only users with role 'approver' may sign.`
    );
  }

  // Invariant 2: Agent can never be an approver
  if (approver.role === 'agent' || approver.username === 'quartermaster') {
    throw new Error('Agent identity is strictly prohibited from approving actions.');
  }

  // Invariant 3: Proposer cannot approve their own proposal
  if (approver.id === record.proposerId || approver.username === record.proposerUsername) {
    throw new Error('Anti-Self-Approval Invariant: The proposer cannot approve their own request.');
  }

  // Invariant 4: No double-approval from the same user
  const alreadyApproved = record.approvals.some(
    (a) => a.approverId === approver.id || a.approverUsername === approver.username
  );
  if (alreadyApproved) {
    throw new Error('User has already approved this request. Duplicate approvals are rejected.');
  }

  // Record valid approval
  record.approvals.push({
    approverId: approver.id,
    approverUsername: approver.username,
    approvedAt: new Date().toISOString()
  });

  record.currentApprovals = record.approvals.length;
  record.updatedAt = new Date().toISOString();

  // Check if Quorum threshold is satisfied!
  if (record.currentApprovals >= record.requiredApprovals) {
    record.status = 'APPROVED';

    // Tide Threshold Cryptographic Engine: Mint VVK-signed Authorization Proof
    const actionHash = computeActionHash(
      record.id,
      record.action.amount || 0,
      record.action.payee || '',
      record.nonce
    );

    const signerKey = await importJWK(vvkPrivJwk, 'ES256');
    const now = Math.floor(Date.now() / 1000);

    const authorizationProof = await new SignJWT({
      iss: 'http://localhost:8080/realms/leashed',
      sub: `tide:authz:${record.id}`,
      aud: 'leashed-bank-enclave',
      actionId: record.id,
      actionType: record.action.type,
      amount: record.action.amount || 0,
      payee: record.action.payee || '',
      actionHash,
      nonce: record.nonce,
      tier: record.evaluation.tier,
      requiredApprovers: record.requiredApprovals,
      approvedCount: record.currentApprovals,
      approvers: record.approvals.map((a) => a.approverUsername),
      signedAt: new Date().toISOString()
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'tide-vvk-key-2026', typ: 'tide-authz+jwt' })
      .setIssuedAt(now)
      .setExpirationTime(now + 600) // Valid for 10 minutes
      .sign(signerKey);

    record.authorizationProof = authorizationProof;

    return {
      success: true,
      message: `Quorum reached (${record.currentApprovals}/${record.requiredApprovals}). Cryptographic authorization proof generated by TideCloak VVK.`,
      record
    };
  }

  return {
    success: true,
    message: `Approval recorded (${record.currentApprovals}/${record.requiredApprovals} required). Quorum pending.`,
    record
  };
}

/**
 * Record a rejection
 */
export function rejectApproval(
  requestId: string,
  approver: { id: string; username: string; role: string },
  reason: string
): ApprovalRecord {
  const record = approvalStore.get(requestId);
  if (!record) {
    throw new Error('Approval request not found');
  }

  if (record.status !== 'PENDING') {
    throw new Error(`Cannot reject request in status '${record.status}'`);
  }

  if (approver.role !== 'approver' && approver.role !== 'admin') {
    throw new Error(`Role '${approver.role}' is not authorized to reject proposals.`);
  }

  record.rejections.push({
    approverId: approver.id,
    approverUsername: approver.username,
    reason: reason || 'Rejected by council approver',
    rejectedAt: new Date().toISOString()
  });

  record.status = 'REJECTED';
  record.updatedAt = new Date().toISOString();
  return record;
}
