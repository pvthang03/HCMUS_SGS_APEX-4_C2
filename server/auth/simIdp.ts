import { SignJWT, generateKeyPair, exportJWK, calculateJwkThumbprint, type JWK, type KeyLike } from 'jose';

/**
 * SIMULATED identity provider — the organisers' "Plan C" for when the Tide network is too loaded
 * to license a realm or create users. The default; LEASHED_IDP=tidecloak switches to the live realm.
 *
 * It stands in for exactly one thing: TideCloak's VVK signature on access tokens. Here a throwaway
 * Ed25519 key generated in memory at startup signs them, which means THIS server could mint any
 * identity — the very power TideCloak removes. Everything downstream is unchanged: tokens are
 * bound to a DPoP key generated in the browser, approvals are browser-signed proofs over the
 * action digest, and the bank re-verifies them. The UI shows a banner whenever this mode is on.
 */
const ROLES: Record<string, string> = { ari: 'approver', bob: 'approver', cleo: 'approver', admin: 'moderator' };
const ISSUER_BASE = 'http://simulated-tidecloak.invalid';
const REALM = 'leashed';

let signingKey: KeyLike | null = null;

export async function startSimIdp() {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  signingKey = privateKey;
  const jwk = { ...(await exportJWK(publicKey)), kid: 'simulated-vvk', alg: 'EdDSA', use: 'sig' };
  process.env.CLIENT_ADAPTER = JSON.stringify({
    realm: REALM,
    'auth-server-url': ISSUER_BASE,
    resource: 'leashed-client',
    jwk: { keys: [jwk] }
  });
}

export const simUsers = Object.keys(ROLES);

export async function issueSimToken(username: string, dpopJwk: JWK): Promise<string> {
  if (!signingKey) throw new Error('Simulated IdP is not enabled.');
  const role = ROLES[username];
  if (!role) throw new Error(`Unknown simulated user '${username}'.`);
  if (!dpopJwk?.kty) throw new Error('A DPoP public key is required.');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    preferred_username: username,
    azp: 'leashed-client',
    realm_access: { roles: [role] },
    cnf: { jkt: await calculateJwkThumbprint(dpopJwk, 'sha256') }
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'simulated-vvk' })
    .setIssuer(`${ISSUER_BASE}/realms/${REALM}`)
    .setSubject(`sim-${username}`)
    .setIssuedAt(now)
    .setExpirationTime(now + 1800)
    .sign(signingKey);
}
