import { randomBytes } from 'crypto';
import seedData from '../data/seed.json' with { type: 'json' };
import { actionDigest, countQuorum, type ApprovalEvidence } from '../approvals/evidence.js';
import { evaluateTier, getPolicy, type Action } from '../policy/policyEngine.js';

export interface BankTransaction {
  id: string;
  proposalId: string;
  amount: number;
  payee: string;
  approvers: string[];
  executedAt: string;
  resultingBalance: number;
}

export class BankRefusal extends Error {
  constructor(message: string, public details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'BankRefusal';
  }
}

/**
 * The enforcement boundary. execute() takes an action plus approval evidence from ANY caller
 * (agent, moderator, app server) and trusts none of them: it recomputes the action digest and
 * re-verifies every approval against the realm VVK. There is no admin flag, no debug bypass,
 * and no key here that could sign anything.
 */
export class MockBank {
  private balance = seedData.treasury.initialBalance;
  private transactions: BankTransaction[] = [];
  private usedNonces = new Set<string>();

  getBalance() {
    return this.balance;
  }

  getTransactions() {
    return [...this.transactions];
  }

  async execute(action: Action, evidence: ApprovalEvidence[]): Promise<BankTransaction> {
    if (action?.kind !== 'PAYMENT') throw new BankRefusal('The bank only executes payments.');
    if (!Number.isFinite(action.amount) || action.amount <= 0) {
      throw new BankRefusal('Invalid amount.');
    }
    if (this.usedNonces.has(action.nonce)) {
      throw new BankRefusal('Replay: this action nonce has already been settled.');
    }

    const required = evaluateTier(action, getPolicy());
    const { approvers, rejected } = await countQuorum(evidence || [], {
      proposalId: action.proposalId,
      digest: actionDigest(action),
      maxAgeSeconds: 3600
    });

    if (approvers.length < required.requiredApprovers) {
      throw new BankRefusal(
        `Quorum not met: ${required.tierName} needs ${required.requiredApprovers} approver-signed ` +
          `approval(s) for this exact action, ${approvers.length} verified.`,
        { tier: required.tier, required: required.requiredApprovers, verified: approvers.length, rejected }
      );
    }
    if (this.balance < action.amount) {
      throw new BankRefusal(`Insufficient balance (${this.balance} < ${action.amount}).`);
    }

    this.usedNonces.add(action.nonce);
    this.balance -= action.amount;
    const tx: BankTransaction = {
      id: 'tx_' + randomBytes(5).toString('hex'),
      proposalId: action.proposalId,
      amount: action.amount,
      payee: action.payee,
      approvers: approvers.map((a) => a.username),
      executedAt: new Date().toISOString(),
      resultingBalance: this.balance
    };
    this.transactions.unshift(tx);
    return tx;
  }
}

export const mockBank = new MockBank();
