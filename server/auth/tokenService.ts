import { readFileSync } from 'fs';
import { join } from 'path';
import {
  SignJWT,
  importJWK,
  generateKeyPair,
  exportJWK,
  calculateJwkThumbprint,
  type JWK
} from 'jose';
import seedData from '../data/seed.json' with { type: 'json' };

// Load VVK private key for Realm authority token signing
const vvkPath = join(process.cwd(), 'server', 'data', 'tide-vvk-private.json');
const vvkPrivJwk: JWK = JSON.parse(readFileSync(vvkPath, 'utf-8'));

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'approver' | 'member' | 'agent';
  description: string;
}

export const SEEDED_USERS: Record<string, UserInfo> = {};
for (const u of seedData.users) {
  SEEDED_USERS[u.username] = u as UserInfo;
}

// In-memory cache of client ephemeral key pairs for simulation
const clientKeyCache = new Map<string, { privateKey: any; publicJwk: JWK; jkt: string }>();

export async function getOrCreateClientKey(username: string) {
  if (clientKeyCache.has(username)) {
    return clientKeyCache.get(username)!;
  }

  // Generate ephemeral EC P-256 keypair for client DPoP
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = 'ES256';
  const jkt = await calculateJwkThumbprint(publicJwk, 'sha256');

  const entry = { privateKey, publicJwk, jkt };
  clientKeyCache.set(username, entry);
  return entry;
}

/**
 * Issue a genuine sender-constrained Tide access token for a synthetic user.
 * Signed by the Realm VVK private key, bound to client's ephemeral DPoP key via cnf.jkt.
 */
export async function issueTideToken(username: string): Promise<{ accessToken: string; user: UserInfo; jkt: string }> {
  const user = SEEDED_USERS[username];
  if (!user) {
    throw new Error(`Unknown user: ${username}`);
  }

  const clientKey = await getOrCreateClientKey(username);
  const signerKey = await importJWK(vvkPrivJwk, 'ES256');

  const now = Math.floor(Date.now() / 1000);

  const token = await new SignJWT({
    sub: user.id,
    preferred_username: user.username,
    name: user.name,
    email: user.email,
    azp: 'leashed-client',
    realm_access: {
      roles: [user.role]
    },
    resource_access: {
      'leashed-client': {
        roles: [user.role]
      }
    },
    cnf: {
      jkt: clientKey.jkt
    }
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'tide-vvk-key-2026', typ: 'JWT' })
    .setIssuer('http://localhost:8080/realms/leashed')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(signerKey);

  return { accessToken: token, user, jkt: clientKey.jkt };
}

/**
 * Generate an RFC 9449 compliant DPoP proof for an HTTP request
 */
export async function generateDPoPProof(
  username: string,
  method: string,
  url: string,
  accessToken?: string
): Promise<string> {
  const clientKey = await getOrCreateClientKey(username);

  // Normalize URL to origin + pathname
  const parsed = new URL(url.startsWith('http') ? url : `http://localhost:3001${url}`);
  const htu = `${parsed.origin}${parsed.pathname}`;

  // Calculate ath (hash of access token) if present
  let ath: string | undefined = undefined;
  if (accessToken) {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(accessToken));
    ath = Buffer.from(digest).toString('base64url');
  }

  const jti = 'jti_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  const now = Math.floor(Date.now() / 1000);

  const proof = await new SignJWT({
    jti,
    htm: method.toUpperCase(),
    htu,
    iat: now,
    ...(ath ? { ath } : {})
  })
    .setProtectedHeader({
      alg: 'ES256',
      typ: 'dpop+jwt',
      jwk: clientKey.publicJwk
    })
    .sign(clientKey.privateKey);

  return proof;
}
