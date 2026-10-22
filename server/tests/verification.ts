/**
 * Security invariants of the enforcement boundary.
 *
 * TEST HARNESS ONLY: TideCloak's VVK private key never exists in one place, so these tests
 * stand up a throwaway Ed25519 "test realm" key in memory and point the verifiers at its public
 * half (via CLIENT_ADAPTER). The code under test is the production verifier, unchanged. Live
 * end-to-end runs use the real realm VVK from data/tidecloak.json.
 */
import assert from 'assert';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { SignJWT, generateKeyPair, exportJWK, calculateJwkThumbprint, type JWK, type KeyLike } from 'jose';

const ISSUER_BASE = 'http://tidecloak.test';
const REALM = 'leashed';
const APP = 'http://app.test';

const realmKey = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
const realmJwk = { ...(await exportJWK(realmKey.publicKey)), kid: 'test-vvk', alg: 'EdDSA', use: 'sig' };
process.env.CLIENT_ADAPTER = JSON.stringify({
  realm: REALM,
  'auth-server-url': ISSUER_BASE,
  resource: 'leashed-client',
  jwk: { keys: [realmJwk] }
});
process.env.CLIENT_APP_URL = APP;
process.env.LEASHED_STATE_DIR = mkdtempSync(join(tmpdir(), 'leashed-test-'));

const { actionDigest, approvalPath } = await import('../approvals/evidence.js');
const { MockBank } = await import('../treasury/mockBank.js');
const policyEngine = await import('../policy/policyEngine.js');
const approvals = await import('../approvals/approvalManager.js');
const { verifyDpop } = await import('../auth/verifyDpop.js');
type Action = import('../policy/policyEngine.js').Action;

interface Session {
  sub: string;
  username: string;
  token: string;
  dpopKey: KeyLike;
  dpopJwk: JWK;
}

async function login(username: string, roles: string[], signer = realmKey.privateKey): Promise<Session> {
  const dpop = await generateKeyPair('ES256', { extractable: true });
  const dpopJwk = await exportJWK(dpop.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    preferred_username: username,
    azp: 'leashed-client',
    realm_access: { roles },
    cnf: { jkt: await calculateJwkThumbprint(dpopJwk, 'sha256') }
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'test-vvk' })
    .setIssuer(`${ISSUER_BASE}/realms/${REALM}`)
    .setSubject(`sub-${username}`)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(signer);
  return { sub: `sub-${username}`, username, token, dpopKey: dpop.privateKey, dpopJwk };
}

async function proofFor(s: Session, method: string, path: string) {
  return new SignJWT({
    htm: method,
    htu: APP + path,
    ath: createHash('sha256').update(s.token).digest('base64url'),
    jti: Math.random().toString(36).slice(2)
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: s.dpopJwk })
    .setIssuedAt()
    .sign(s.dpopKey);
}

/** What the browser's secureFetch produces when the approver presses Approve. */
async function approve(s: Session, proposalId: string, digest: string) {
  return { accessToken: s.token, dpopProof: await proofFor(s, 'POST', approvalPath(proposalId, digest)) };
}

function payment(proposalId: string, amount: number, payee: string): Action {
  return { kind: 'PAYMENT', proposalId, nonce: 'n-' + proposalId, invoiceId: 'INV', amount, payee };
}

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`[FAIL] ${name}: ${e.message}`);
    failed++;
  }
}
async function refused(p: Promise<unknown>, pattern: RegExp) {
  await assert.rejects(p, (e: any) => pattern.test(e.message) || assert.fail(`wrong reason: ${e.message}`));
}

const ari = await login('ari', ['approver']);
const bo = await login('bo', ['approver']);
const cleo = await login('cleo', ['approver']);
const mod = await login('admin', ['moderator']);
const forger = await login('ari', ['approver'], (await generateKeyPair('EdDSA', { crv: 'Ed25519' })).privateKey);

await policyEngine.loadPolicy();

console.log('Leashed enforcement-boundary tests\n');

await test('Bank refuses a payment with no approvals (agent or admin calling directly)', async () => {
  const bank = new MockBank();
  await refused(bank.execute(payment('p0', 900, 'attacker-vendor-syndicate'), []), /Quorum not met.*0 verified/);
});

await test('Tier 1: one Tide-signed approver pays 30 credits to an approved vendor', async () => {
  const bank = new MockBank();
  const a = payment('p1', 30, 'Apex Cloud Solutions');
  const tx = await bank.execute(a, [await approve(ari, 'p1', actionDigest(a))]);
  assert.equal(tx.approvers.join(), 'ari');
  assert.equal(bank.getBalance(), 970);
});

await test('Tier 2: 80 credits is refused with 1 of 2 approvals, settles with 2', async () => {
  const bank = new MockBank();
  const a = payment('p2', 80, 'Neural Creative Assets');
  const d = actionDigest(a);
  await refused(bank.execute(a, [await approve(ari, 'p2', d)]), /needs 2.*1 verified/);
  const tx = await bank.execute(a, [await approve(ari, 'p2', d), await approve(bo, 'p2', d)]);
  assert.equal(tx.approvers.sort().join(), 'ari,bo');
});

await test('The same approver twice counts once', async () => {
  const a = payment('p3', 80, 'Neural Creative Assets');
  const d = actionDigest(a);
  await refused(new MockBank().execute(a, [await approve(ari, 'p3', d), await approve(ari, 'p3', d)]), /1 verified/);
});

await test('Moderator (no approver role in the Tide token) is not counted', async () => {
  const a = payment('p4', 80, 'Neural Creative Assets');
  const d = actionDigest(a);
  await refused(new MockBank().execute(a, [await approve(ari, 'p4', d), await approve(mod, 'p4', d)]), /1 verified/);
});

await test('Editing the amount after approval is refused (digest no longer matches)', async () => {
  const a = payment('p5', 80, 'Neural Creative Assets');
  const d = actionDigest(a);
  const ev = [await approve(ari, 'p5', d), await approve(bo, 'p5', d)];
  await refused(new MockBank().execute({ ...a, amount: 800 } as Action, ev), /0 verified/);
});

await test('Approvals for one proposal cannot be reused for another', async () => {
  const a = payment('p6', 80, 'Neural Creative Assets');
  const b = payment('p7', 80, 'attacker-vendor-syndicate');
  const ev = [await approve(ari, 'p6', actionDigest(a)), await approve(bo, 'p6', actionDigest(a))];
  await refused(new MockBank().execute(b, ev), /0 verified/);
});

await test('A settled action cannot be replayed', async () => {
  const bank = new MockBank();
  const a = payment('p8', 80, 'Neural Creative Assets');
  const d = actionDigest(a);
  const ev = [await approve(ari, 'p8', d), await approve(bo, 'p8', d)];
  await bank.execute(a, ev);
  await refused(bank.execute(a, ev), /Replay/);
});

await test('A token not signed by the realm VVK is refused', async () => {
  const a = payment('p9', 30, 'Apex Cloud Solutions');
  await refused(new MockBank().execute(a, [await approve(forger, 'p9', actionDigest(a))]), /0 verified/);
});

await test('A proof signed by a key other than the token-bound one is refused', async () => {
  const a = payment('p10', 30, 'Apex Cloud Solutions');
  const stolen = { ...bo, token: ari.token }; // Ari's token, Bo's DPoP key
  await refused(new MockBank().execute(a, [await approve(stolen, 'p10', actionDigest(a))]), /0 verified/);
});

await test('recordApproval: moderator approval is rejected with 403', async () => {
  const p = approvals.createProposal({ kind: 'PAYMENT', invoiceId: 'X', amount: 80, payee: 'Neural Creative Assets' }, { kind: 'agent', username: 'quartermaster' });
  await assert.rejects(approvals.recordApproval(p.id, p.digest, await approve(mod, p.id, p.digest)), (e: any) => e.status === 403);
});

await test('recordApproval: a proposer cannot approve their own proposal', async () => {
  const p = approvals.createProposal({ kind: 'PAYMENT', invoiceId: 'X', amount: 80, payee: 'Neural Creative Assets' }, { kind: 'user', username: 'ari', sub: ari.sub });
  await assert.rejects(approvals.recordApproval(p.id, p.digest, await approve(ari, p.id, p.digest)), /own proposal/);
});

await test('Tier 3: a policy change with 2 of 3 approvals is refused; 3 of 3 applies it', async () => {
  const current = policyEngine.getPolicy();
  const newPolicy = structuredClone(current);
  newPolicy.version = current.version + 1;
  newPolicy.tiers['1'].maxAmountExclusive = 60;
  const action = { kind: 'CHANGE_POLICY' as const, proposalId: 'pol1', nonce: 'n', basePolicyVersion: current.version, newPolicy, summary: 'limit 60' };
  const d = actionDigest(action);
  await refused(policyEngine.applyAmendment({ action, evidence: [await approve(ari, 'pol1', d), await approve(bo, 'pol1', d)] }), /needs 3/);
  await policyEngine.applyAmendment({ action, evidence: [await approve(ari, 'pol1', d), await approve(bo, 'pol1', d), await approve(cleo, 'pol1', d)] });
  assert.equal(policyEngine.getPolicy().tiers['1'].maxAmountExclusive, 60);
});

await test('Restart re-verifies amendments; a tampered state file falls back to the genesis policy', async () => {
  await policyEngine.loadPolicy();
  assert.equal(policyEngine.getPolicy().version, 2, 'approved amendment survives restart');
  const file = join(process.env.LEASHED_STATE_DIR!, 'policy-amendments.json');
  const stored = JSON.parse(readFileSync(file, 'utf-8'));
  stored[0].action.newPolicy.tiers['1'].maxAmountExclusive = 1000; // admin edits the file on disk
  writeFileSync(file, JSON.stringify(stored));
  await policyEngine.loadPolicy();
  assert.equal(policyEngine.getPolicy().version, 1);
  assert.equal(policyEngine.getPolicy().tiers['1'].maxAmountExclusive, 50);
});

await test('API auth: a DPoP-bound token sent as plain Bearer is rejected', async () => {
  await refused(
    verifyDpop({ url: '/api/policy', method: 'GET', headers: { authorization: `Bearer ${ari.token}` } }, ari.token, { cnf: { jkt: 'x' } }),
    /Bearer/
  );
});

await test('API auth: a DPoP proof for a different URL is rejected', async () => {
  const proof = await proofFor(ari, 'GET', '/api/treasury/status');
  const jkt = await calculateJwkThumbprint(ari.dpopJwk, 'sha256');
  await refused(
    verifyDpop({ url: '/api/policy', method: 'GET', headers: { authorization: `DPoP ${ari.token}`, dpop: proof } }, ari.token, { cnf: { jkt } }),
    /htu/
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
