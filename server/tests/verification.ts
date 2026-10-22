import assert from 'assert';
import { issueTideToken, generateDPoPProof } from '../auth/tokenService.js';
import { verifyTideJWT, hasRole } from '../auth/tideJWT.js';
import { verifyDpop } from '../auth/verifyDpop.js';
import { getRequiredApproval } from '../policy/policyEngine.js';
import {
  createApprovalRequest,
  submitApproval,
  getApprovalRequest
} from '../approvals/approvalManager.js';
import { mockBank } from '../treasury/mockBank.js';
import { agentGateway } from '../agent/agentGateway.js';
import { quartermasterAgent } from '../agent/quartermaster.js';

async function runVerificationSuite() {
  console.log('====================================================');
  console.log('RUNNING LEASHED TIDECLOAK VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  // 1. Role & Token Issuance
  await test('Issue valid Tide token for Ari (approver) with cnf.jkt binding', async () => {
    const session = await issueTideToken('ari');
    assert(session.accessToken, 'Token should exist');
    assert(session.jkt, 'jkt thumbprint should exist');

    const claims = await verifyTideJWT(session.accessToken);
    assert.strictEqual(claims.preferred_username, 'ari');
    assert(hasRole(claims, 'approver'), "Should have 'approver' role");
    assert(!hasRole(claims, 'admin'), "Should NOT have 'admin' role");
  });

  // 2. Sender-constrained DPoP verification (RFC 9449)
  await test('Verify genuine RFC 9449 DPoP proof passes', async () => {
    const session = await issueTideToken('bo');
    const url = 'http://localhost:3001/api/treasury/status';
    const method = 'GET';
    const proof = await generateDPoPProof('bo', method, url, session.accessToken);

    const claims = await verifyTideJWT(session.accessToken);
    const req = {
      url,
      method,
      headers: {
        authorization: `DPoP ${session.accessToken}`,
        dpop: proof
      }
    };

    await verifyDpop(req, session.accessToken, claims as any);
  });

  // 3. Invariant: Bare Bearer presentation of bound token is strictly REJECTED
  await test('Reject bare Bearer presentation of cnf.jkt token (anti-replay AP-43)', async () => {
    const session = await issueTideToken('bo');
    const url = 'http://localhost:3001/api/treasury/status';
    const claims = await verifyTideJWT(session.accessToken);

    const req = {
      url,
      method: 'GET',
      headers: {
        authorization: `Bearer ${session.accessToken}` // Bare Bearer without DPoP!
      }
    };

    let rejected = false;
    try {
      await verifyDpop(req, session.accessToken, claims as any);
    } catch (e: any) {
      rejected = true;
      assert(e.message.includes('DPoP auth scheme'), 'Should name DPoP scheme requirement');
    }
    assert(rejected, 'Bare Bearer presentation of sender-constrained token MUST be rejected');
  });

  // 4. Policy Tiers evaluation
  await test('Policy: pay(30) to approved vendor is Tier 1 (1 approver)', async () => {
    const evalResult = getRequiredApproval({
      type: 'PAYMENT',
      amount: 30,
      payee: 'Apex Cloud Solutions'
    });
    assert.strictEqual(evalResult.tier, 1);
    assert.strictEqual(evalResult.requiredApprovers, 1);
  });

  await test('Policy: pay(80) is Tier 2 (2 approvers)', async () => {
    const evalResult = getRequiredApproval({
      type: 'PAYMENT',
      amount: 80,
      payee: 'Neural Creative Assets'
    });
    assert.strictEqual(evalResult.tier, 2);
    assert.strictEqual(evalResult.requiredApprovers, 2);
  });

  await test('Policy: change_policy is Tier 3 (3 approvers)', async () => {
    const evalResult = getRequiredApproval({
      type: 'CHANGE_POLICY'
    });
    assert.strictEqual(evalResult.tier, 3);
    assert.strictEqual(evalResult.requiredApprovers, 3);
  });

  // 5. Quorum approval gate
  await test('Quorum: 1 of 2 stays blocked; 2 of 2 produces Tide VVK authorization proof', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 80, payee: 'Neural Creative Assets' },
      { id: 'usr_agent', username: 'quartermaster', role: 'agent' }
    );

    // 1st approval by Ari (approver)
    const res1 = await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });
    assert.strictEqual(res1.record.status, 'PENDING');
    assert.strictEqual(res1.record.currentApprovals, 1);
    assert.strictEqual(res1.record.authorizationProof, undefined, 'No VVK proof at 1-of-2');

    // 2nd approval by Bo (approver) -> Quorum reached!
    const res2 = await submitApproval(cr.id, { id: 'usr_bo', username: 'bo', role: 'approver' });
    assert.strictEqual(res2.record.status, 'APPROVED');
    assert.strictEqual(res2.record.currentApprovals, 2);
    assert(res2.record.authorizationProof, 'VVK authorization proof MUST be generated on quorum');
  });

  // 6. Anti-duplicate approval
  await test('Invariant: Approving twice with the same user does not count twice', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 80, payee: 'Neural Creative Assets' },
      { id: 'usr_agent', username: 'quartermaster', role: 'agent' }
    );

    await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });

    let duplicateRejected = false;
    try {
      await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });
    } catch (e: any) {
      duplicateRejected = true;
      assert(e.message.includes('already approved'), 'Should reject duplicate approval');
    }
    assert(duplicateRejected, 'Duplicate approval by same user must be rejected');
  });

  // 7. Anti-self-approval
  await test('Invariant: Proposer cannot approve own proposal', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 40, payee: 'Apex Cloud Solutions' },
      { id: 'usr_ari', username: 'ari', role: 'approver' }
    );

    let selfRejected = false;
    try {
      await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });
    } catch (e: any) {
      selfRejected = true;
      assert(e.message.includes('proposer cannot approve their own request'));
    }
    assert(selfRejected, 'Self-approval must be rejected');
  });

  // 8. Agent cannot approve
  await test('Invariant: Agent identity can never act as approver', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 40, payee: 'Apex Cloud Solutions' },
      { id: 'usr_dani', username: 'dani', role: 'member' }
    );

    let agentRejected = false;
    try {
      await submitApproval(cr.id, { id: 'usr_agent', username: 'quartermaster', role: 'agent' });
    } catch (e: any) {
      agentRejected = true;
      assert(e.message.includes('Role'));
    }
    assert(agentRejected, 'Agent must be rejected from approving');
  });

  // 9. Mock Bank execution with valid Tide authorization proof
  await test('Bank: Settles payment when presented with valid Tide authorization proof', async () => {
    const initialBalance = mockBank.getBalance();

    // Create and approve Tier 1 payment (30 credits)
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 30, payee: 'Apex Cloud Solutions' },
      { id: 'usr_agent', username: 'quartermaster', role: 'agent' }
    );

    const approveRes = await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });
    assert(approveRes.record.authorizationProof, 'Must have authorization proof');

    const execRes = await mockBank.executePayment(
      cr.id,
      30,
      'Apex Cloud Solutions',
      approveRes.record.authorizationProof!
    );

    assert(execRes.success, 'Execution should succeed');
    assert.strictEqual(execRes.transaction.status, 'SETTLED');
    assert.strictEqual(mockBank.getBalance(), initialBalance - 30);
  });

  // 10. Direct bank call with admin token (without Tide VVK proof) is REJECTED
  await test('Enforcement Boundary: Direct bank execution without Tide VVK proof is REJECTED', async () => {
    let directRejected = false;
    try {
      await mockBank.executePayment('direct_action_123', 500, 'attacker-vendor', '');
    } catch (e: any) {
      directRejected = true;
      assert(e.message.includes('Missing cryptographic authorization proof'));
    }
    assert(directRejected, 'Direct execution without proof must be rejected');
  });

  // 11. Tampered amount or payee in authorization is REJECTED
  await test('Enforcement Boundary: Tampered authorization (amount mismatch) is REJECTED', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 30, payee: 'Apex Cloud Solutions' },
      { id: 'usr_agent', username: 'quartermaster', role: 'agent' }
    );
    const approveRes = await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });

    let tamperedRejected = false;
    try {
      // Attacker tries to pass the valid 30-credit proof to withdraw 300 credits!
      await mockBank.executePayment(
        cr.id,
        300,
        'Apex Cloud Solutions',
        approveRes.record.authorizationProof!
      );
    } catch (e: any) {
      tamperedRejected = true;
      assert(e.message.includes('tampering') || e.message.includes('mismatch'));
    }
    assert(tamperedRejected, 'Tampered amount must be rejected');
  });

  // 12. Nonce replay is REJECTED
  await test('Enforcement Boundary: Replaying an already-consumed authorization is REJECTED', async () => {
    const cr = createApprovalRequest(
      { type: 'PAYMENT', amount: 15, payee: 'Apex Cloud Solutions' },
      { id: 'usr_agent', username: 'quartermaster', role: 'agent' }
    );
    const approveRes = await submitApproval(cr.id, { id: 'usr_ari', username: 'ari', role: 'approver' });

    // First execution succeeds
    await mockBank.executePayment(
      cr.id,
      15,
      'Apex Cloud Solutions',
      approveRes.record.authorizationProof!
    );

    // Second execution with SAME proof must fail on nonce replay
    let replayRejected = false;
    try {
      await mockBank.executePayment(
        cr.id,
        15,
        'Apex Cloud Solutions',
        approveRes.record.authorizationProof!
      );
    } catch (e: any) {
      replayRejected = true;
      assert(e.message.includes('Replay attack detected'));
    }
    assert(replayRejected, 'Replay of consumed proof must be rejected');
  });

  // 13. Poisoned invoice injection attack is BLOCKED BY TIDECLOAK
  await test('Scenario 2 Attack: Poisoned invoice injection is BLOCKED BY TIDECLOAK', async () => {
    const result = await quartermasterAgent.runPoisonedInvoiceScenario();
    assert.strictEqual(result.status, 'BLOCKED_BY_TIDECLOAK');
    assert(result.attemptResult.blockedByTide, 'Gateway must block the attempt');
  });

  console.log('\n====================================================');
  console.log(`VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerificationSuite().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
