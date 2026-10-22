import { readFileSync } from 'fs';
import { join } from 'path';
import { createProposal, getProposal, type Proposal } from '../approvals/approvalManager.js';
import { mockBank, BankRefusal } from '../treasury/mockBank.js';
import type { PaymentAction } from '../policy/policyEngine.js';
import seedData from '../data/seed.json' with { type: 'json' };

export interface AgentLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  tool: string;
  actionSummary: string;
  status: 'ALLOWED' | 'PROPOSAL_SUBMITTED' | 'BLOCKED' | 'EXECUTED' | 'COMPROMISED';
  tier?: number;
  /** Which layer made the decision, so the log never over-claims. */
  enforcedBy?: string;
  details: unknown;
}

const auditLog: AgentLogEntry[] = [];

export function logAction(entry: Omit<AgentLogEntry, 'id' | 'timestamp'>): AgentLogEntry {
  const e = { id: 'log_' + Math.random().toString(36).slice(2, 9), timestamp: new Date().toISOString(), ...entry };
  auditLog.unshift(e);
  return e;
}

export function getAgentLogs(): AgentLogEntry[] {
  return [...auditLog];
}

/**
 * The only door the Quartermaster agent has. The agent holds no Tide session and no key
 * (GAP-064: an autonomous process cannot authenticate to Tide), so the most it can do is read,
 * propose, and ask the bank to execute — which the bank refuses without human evidence.
 */
export class AgentGateway {
  readInvoices() {
    logAction({
      actor: 'quartermaster',
      tool: 'read_invoices',
      actionSummary: `Read ${seedData.invoices.length} invoices from the inbox`,
      status: 'ALLOWED',
      tier: 0,
      details: { invoices: seedData.invoices.map((i) => i.id) }
    });
    return seedData.invoices;
  }

  readDocument(relPath: string): string {
    const text = readFileSync(join(process.cwd(), relPath), 'utf-8');
    logAction({
      actor: 'quartermaster',
      tool: 'read_document',
      actionSummary: `Read untrusted document ${relPath}`,
      status: 'ALLOWED',
      tier: 0,
      details: { preview: text.slice(0, 160) }
    });
    return text;
  }

  proposePayment(invoiceId: string, amount: number, payee: string, source: string): Proposal {
    const p = createProposal(
      { kind: 'PAYMENT', invoiceId, amount, payee },
      { kind: 'agent', username: 'quartermaster', source }
    );
    logAction({
      actor: 'quartermaster',
      tool: 'propose_payment',
      actionSummary: `Proposed ${amount} credits to '${payee}' → ${p.evaluation.tierName}, needs ${p.evaluation.requiredApprovers} approver(s)`,
      status: 'PROPOSAL_SUBMITTED',
      tier: p.evaluation.tier,
      details: { proposalId: p.id, digest: p.digest, source }
    });
    return p;
  }

  /** The agent asks the bank to pay. It can only hand over whatever evidence humans produced. */
  async requestExecution(action: PaymentAction): Promise<{ ok: boolean; message: string }> {
    const evidence = getProposal(action.proposalId)?.evidence ?? [];
    try {
      const tx = await mockBank.execute(action, evidence);
      logAction({
        actor: 'quartermaster',
        tool: 'execute_payment',
        actionSummary: `Bank settled ${tx.amount} credits to '${tx.payee}'`,
        status: 'EXECUTED',
        enforcedBy: 'Bank verifier (Tide-signed approvals)',
        details: tx
      });
      return { ok: true, message: `Settled ${tx.id}` };
    } catch (e: any) {
      logAction({
        actor: 'quartermaster',
        tool: 'execute_payment',
        actionSummary: `Tried to pay ${action.amount} credits to '${action.payee}' → REFUSED`,
        status: 'BLOCKED',
        tier: e instanceof BankRefusal ? (e.details.tier as number) : undefined,
        enforcedBy: 'Bank verifier: needs approvals signed by Tide sessions holding the approver role',
        details: { reason: e.message, ...(e instanceof BankRefusal ? e.details : {}) }
      });
      return { ok: false, message: e.message };
    }
  }
}

export const agentGateway = new AgentGateway();
