import { createApprovalRequest, listApprovalRequests, type ApprovalRecord } from '../approvals/approvalManager.js';
import { getRequiredApproval, type ActionRequest } from '../policy/policyEngine.js';
import seedData from '../data/seed.json' with { type: 'json' };

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  tool: string;
  actionSummary: string;
  status: 'ALLOWED' | 'PROPOSAL_SUBMITTED' | 'BLOCKED_BY_TIDECLOAK' | 'FAILED';
  tier?: number;
  details: any;
}

const agentAuditLogs: AgentLogEntry[] = [];

export function logAgentAction(
  tool: string,
  actionSummary: string,
  status: AgentLogEntry['status'],
  details: any,
  tier?: number
): AgentLogEntry {
  const entry: AgentLogEntry = {
    id: 'log_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    tool,
    actionSummary,
    status,
    tier,
    details
  };
  agentAuditLogs.unshift(entry);
  return entry;
}

export function getAgentLogs(): AgentLogEntry[] {
  return [...agentAuditLogs];
}

/**
 * Gateway through which the Quartermaster AI agent must interact with the guild treasury.
 * Invariant: The agent holds ZERO master keys and cannot directly call the Mock Bank.
 */
export class AgentGateway {
  /**
   * Tool 1: read_invoices
   */
  public async readInvoices(): Promise<any[]> {
    logAgentAction(
      'read_invoices',
      'Agent inspected guild invoice queue',
      'ALLOWED',
      { invoiceCount: seedData.invoices.length },
      0
    );
    return seedData.invoices;
  }

  /**
   * Tool 2: draft_payment_proposal
   */
  public async draftPaymentProposal(
    invoiceId: string,
    amount: number,
    payee: string,
    reason: string
  ): Promise<{ status: string; message: string; record?: ApprovalRecord }> {
    const action: ActionRequest = {
      type: 'PAYMENT',
      amount,
      payee,
      proposerId: 'usr_agent',
      proposerRole: 'agent'
    };

    const evaluation = getRequiredApproval(action);

    // Create formal approval request in Module C
    const record = createApprovalRequest(action, {
      id: 'usr_agent',
      username: 'quartermaster',
      role: 'agent'
    });

    logAgentAction(
      'draft_payment_proposal',
      `Drafted payment proposal of ${amount} credits to '${payee}' (Tier ${evaluation.tier})`,
      'PROPOSAL_SUBMITTED',
      {
        invoiceId,
        amount,
        payee,
        reason,
        tier: evaluation.tier,
        requiredApprovers: evaluation.requiredApprovers,
        approvalRequestId: record.id
      },
      evaluation.tier
    );

    return {
      status: 'PROPOSAL_SUBMITTED',
      message: `Proposal submitted. TideCloak Policy enforces Tier ${evaluation.tier}: Requires ${evaluation.requiredApprovers} human approver signature(s).`,
      record
    };
  }

  /**
   * Tool 3: attempt_direct_payment (Demonstration of Agent Attack / Rogue Action)
   */
  public async attemptDirectPayment(
    amount: number,
    payee: string,
    reason: string
  ): Promise<{ status: string; message: string; blockedByTide: boolean }> {
    const action: ActionRequest = {
      type: 'PAYMENT',
      amount,
      payee,
      proposerId: 'usr_agent',
      proposerRole: 'agent'
    };

    const evaluation = getRequiredApproval(action);

    // Emergent Authority Invariant:
    // The Agent cannot execute any payment unilaterally!
    logAgentAction(
      'attempt_direct_payment',
      `ATTACK DETECTED: Agent attempted unilateral payment of ${amount} credits to '${payee}' without quorum!`,
      'BLOCKED_BY_TIDECLOAK',
      {
        amount,
        payee,
        reason,
        tier: evaluation.tier,
        requiredApprovers: evaluation.requiredApprovers,
        reasonBlocked: 'Autonomous agent holds zero spending keys. Direct execution refused by TideCloak policy.'
      },
      evaluation.tier
    );

    return {
      status: 'BLOCKED_BY_TIDECLOAK',
      message: `BLOCKED BY TIDECLOAK: Agent attempted unilateral payment of ${amount} credits to '${payee}'. Tier ${evaluation.tier} policy strictly requires ${evaluation.requiredApprovers}-of-3 human approver quorum. Agent has no master key to spend alone.`,
      blockedByTide: true
    };
  }
}

export const agentGateway = new AgentGateway();
