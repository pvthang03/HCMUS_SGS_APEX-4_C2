import { jwtVerify, createLocalJWKSet } from 'jose';
import { loadTideConfig } from '../auth/tidecloakConfig.js';
import { computeActionHash, getApprovalRequest } from '../approvals/approvalManager.js';
import seedData from '../data/seed.json' with { type: 'json' };

export interface BankTransaction {
  id: string;
  actionId: string;
  amount: number;
  payee: string;
  actionHash: string;
  nonce: string;
  approvers: string[];
  status: 'SETTLED' | 'REJECTED';
  executedAt: string;
  resultingBalance: number;
}

export class MockBankEngine {
  private balance: number;
  private transactions: BankTransaction[] = [];
  private usedNonces = new Set<string>();
  private jwks: ReturnType<typeof createLocalJWKSet> | null = null;

  constructor() {
    this.balance = seedData.treasury.initialBalance;
  }

  private getJWKS() {
    if (!this.jwks) {
      const config = loadTideConfig();
      this.jwks = createLocalJWKSet(config.jwk);
    }
    return this.jwks;
  }

  public getBalance(): number {
    return this.balance;
  }

  public getTransactions(): BankTransaction[] {
    return [...this.transactions];
  }

  /**
   * Core Enforcement Boundary:
   * Refuses payment unless presented with a valid, unspent TideCloak VVK-signed Authorization Proof
   * strictly bound to (actionId, amount, payee, nonce).
   */
  public async executePayment(
    actionId: string,
    amount: number,
    payee: string,
    authorizationProof: string
  ): Promise<{ success: boolean; transaction: BankTransaction; message: string }> {
    if (!authorizationProof) {
      throw new Error(
        'TideCloak Enforcement: Execution refused. Missing cryptographic authorization proof from Tide.'
      );
    }

    // 1. Verify the authorization proof signature with TideCloak VVK (Realm Public Key)
    const jwks = this.getJWKS();
    let payload: any;
    try {
      const verified = await jwtVerify(authorizationProof, jwks, {
        issuer: 'http://localhost:8080/realms/leashed',
        audience: 'leashed-bank-enclave'
      });
      payload = verified.payload;
    } catch (err: any) {
      throw new Error(
        `TideCloak Enforcement: Invalid or forged authorization proof. Cryptographic verification failed: ${err.message}`
      );
    }

    // 2. Verify Action ID matches
    if (payload.actionId !== actionId) {
      throw new Error(
        `TideCloak Enforcement: Action ID mismatch. Expected '${actionId}', proof contains '${payload.actionId}'.`
      );
    }

    // 3. Verify Amount matches
    if (payload.amount !== amount) {
      throw new Error(
        `TideCloak Enforcement: Amount tampering detected. Expected ${amount}, proof authorizes ${payload.amount}.`
      );
    }

    // 4. Verify Payee matches
    if (payload.payee !== payee) {
      throw new Error(
        `TideCloak Enforcement: Payee tampering detected. Expected '${payee}', proof authorizes '${payload.payee}'.`
      );
    }

    // 5. Verify Nonce freshness (Anti-Replay Invariant)
    const nonce = payload.nonce;
    if (!nonce || this.usedNonces.has(nonce)) {
      throw new Error(
        `TideCloak Enforcement: Replay attack detected. Nonce '${nonce}' has already been consumed.`
      );
    }

    // 6. Verify Action Hash strictly binds all parameters
    const expectedHash = computeActionHash(actionId, amount, payee, nonce);
    if (payload.actionHash !== expectedHash) {
      throw new Error(
        'TideCloak Enforcement: Action hash mismatch. The transaction parameters have been modified.'
      );
    }

    // 7. Verify Treasury solvency
    if (this.balance < amount) {
      throw new Error(
        `Bank Refusal: Insufficient treasury balance (${this.balance} credits available, ${amount} requested).`
      );
    }

    // 8. Consume nonce & execute settlement
    this.usedNonces.add(nonce);
    this.balance -= amount;

    const txId = 'tx_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const transaction: BankTransaction = {
      id: txId,
      actionId,
      amount,
      payee,
      actionHash: expectedHash,
      nonce,
      approvers: payload.approvers || [],
      status: 'SETTLED',
      executedAt: new Date().toISOString(),
      resultingBalance: this.balance
    };

    this.transactions.unshift(transaction);

    // Update approval record if exists
    const approval = getApprovalRequest(actionId);
    if (approval) {
      approval.status = 'EXECUTED';
      approval.executionResult = transaction;
      approval.updatedAt = new Date().toISOString();
    }

    return {
      success: true,
      transaction,
      message: `Payment of ${amount} credits to '${payee}' settled successfully. Treasury balance: ${this.balance} credits.`
    };
  }
}

export const mockBank = new MockBankEngine();
