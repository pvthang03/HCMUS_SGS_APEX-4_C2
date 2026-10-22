// End-to-end smoke test of the demo script against a running `npm run dev` (simulated sign-in).
// Each persona gets its own DPoP key, exactly like a separate browser. Usage: node scripts/e2e-sim.mjs
import { SignJWT, generateKeyPair, exportJWK } from 'jose';
import { createHash, randomUUID } from 'crypto';

const APP = process.env.APP || 'http://localhost:5173';
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

async function signIn(username) {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const r = await fetch(`${APP}/api/sim/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, dpopJwk: jwk }) });
  const { accessToken } = await r.json();
  const ath = createHash('sha256').update(accessToken).digest('base64url');
  return async (method, path, body) => {
    const proof = await new SignJWT({ htm: method, htu: APP + path, ath, jti: randomUUID() })
      .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk }).setIssuedAt().sign(privateKey);
    const res = await fetch(APP + path, {
      method, headers: { Authorization: `DPoP ${accessToken}`, DPoP: proof, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
}

const ari = await signIn('ari'), cleo = await signIn('cleo'), admin = await signIn('admin');
check((await ari('GET', '/api/me')).body.role === 'approver', 'ari signs in as approver');
check((await admin('GET', '/api/me')).body.role === 'moderator', 'admin signs in as moderator');
check((await fetch(`${APP}/api/treasury/status`)).status === 401, 'no token → 401');

const start = (await ari('GET', '/api/treasury/status')).body.balance;
const s2 = (await ari('POST', '/api/agent/run/poisoned')).body;
check(s2.direct && !s2.direct.ok && /0 verified/.test(s2.direct.message), `poisoned invoice: direct bank call refused (${s2.direct?.message})`);
check((await ari('GET', '/api/treasury/status')).body.balance === start, 'treasury untouched after attack');

await ari('POST', '/api/agent/run/quorum');
const p80 = (await ari('GET', '/api/approvals')).body.find((p) => p.status === 'PENDING' && p.action.amount === 80);
check(!!p80, '80-credit proposal is pending (Tier 2)');

const a = await admin('POST', p80.approvalPath);
check(a.status === 403, `admin approve → 403 (${a.body.message})`);
const rogue = (await admin('POST', '/api/attacks/rogue-admin')).body;
check(rogue.attempts?.every((x) => x.blocked), `rogue admin: ${rogue.attempts?.length} attempts all refused`);

check((await ari('POST', p80.approvalPath)).status === 200, 'ari approves (1 of 2)');
const e1 = await ari('POST', `/api/approvals/${p80.id}/execute`);
check(e1.status === 403 && /1 verified/.test(e1.body.message), `execute at 1 of 2 refused (${e1.body.message})`);
check((await ari('POST', p80.approvalPath)).status === 409, 'ari approving twice → 409');
check((await cleo('POST', p80.approvalPath)).status === 200, 'cleo approves (2 of 2)');
const e2 = await cleo('POST', `/api/approvals/${p80.id}/execute`);
check(e2.status === 200 && e2.body.status === 'EXECUTED', 'execute at 2 of 2 settles');
check((await ari('GET', '/api/treasury/status')).body.balance === start - 80, `balance ${start} → ${start - 80}`);

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
