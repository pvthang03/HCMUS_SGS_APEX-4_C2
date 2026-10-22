import {
  jwtVerify,
  importJWK,
  calculateJwkThumbprint,
  decodeProtectedHeader,
  type JWK
} from 'jose';

export class DpopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DpopError';
  }
}

export interface JtiStore {
  claim(jti: string, expiresAtMs: number): Promise<boolean>;
}

export class MemoryJtiStore implements JtiStore {
  private seen = new Map<string, number>();

  async claim(jti: string, expiresAtMs: number): Promise<boolean> {
    const now = Date.now();
    for (const [k, exp] of this.seen) {
      if (exp < now) this.seen.delete(k);
    }
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs);
    return true;
  }
}

const defaultStore = new MemoryJtiStore();
const IAT_SKEW_SECONDS = 300;

/**
 * The browser reaches the API through the app's public origin (Vite proxies /api), so the
 * proof's htu is that origin + path. The allowed origins are configured (CLIENT_APP_URL, comma
 * separated, plus the local dev origin) instead of trusting forwarded headers.
 */
export function appOrigins(): string[] {
  const configured = (process.env.CLIENT_APP_URL || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  return [...new Set([...configured, 'http://localhost:5173'])];
}

export function allowedHtus(pathname: string): string[] {
  return appOrigins().map((o) => `${o}${pathname}`);
}

export function requestPath(req: { url: string }): string {
  return new URL(req.url, 'http://placeholder').pathname;
}

export interface VerifyDpopOptions {
  jtiStore?: JtiStore;
  iatSkewSeconds?: number;
}

export async function verifyDpop(
  req: { url: string; method: string; headers: Record<string, string | string[] | undefined> },
  accessToken: string,
  claims: { cnf?: { jkt?: string } },
  opts: VerifyDpopOptions = {}
): Promise<void> {
  const jkt = claims.cnf?.jkt;

  if (!jkt) {
    throw new DpopError(
      'Access token has no cnf.jkt — it is not sender-constrained. ' +
      'Rejecting because DPoP is mandatory for this realm.'
    );
  }

  const authzHeader = req.headers['authorization'];
  const authz = Array.isArray(authzHeader) ? authzHeader[0] : (authzHeader || '');

  if (!/^DPoP /i.test(authz)) {
    throw new DpopError(
      'Sender-constrained token presented without DPoP auth scheme. ' +
      'A cnf.jkt token sent as Bearer is a replay of a stolen token.'
    );
  }

  const proofHeader = req.headers['dpop'];
  const proof = Array.isArray(proofHeader) ? proofHeader[0] : proofHeader;

  if (!proof) {
    throw new DpopError('Missing DPoP proof header.');
  }

  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(proof);
  } catch {
    throw new DpopError('DPoP proof is not a compact JWS.');
  }

  if (header.typ !== 'dpop+jwt') {
    throw new DpopError(`DPoP proof typ is '${header.typ}', expected 'dpop+jwt'.`);
  }

  const jwk = header.jwk as JWK | undefined;
  if (!jwk) {
    throw new DpopError('DPoP proof header has no embedded jwk.');
  }

  let payload: Record<string, unknown>;
  try {
    const key = await importJWK(jwk, header.alg);
    const verified = await jwtVerify(proof, key);
    payload = verified.payload as Record<string, unknown>;
  } catch (e: any) {
    throw new DpopError(`DPoP proof signature invalid: ${e?.message || String(e)}`);
  }

  // Calculate JWK thumbprint per RFC 7638
  const thumb = await calculateJwkThumbprint(jwk, 'sha256');
  if (thumb !== jkt) {
    throw new DpopError(
      'DPoP proof key does not match token cnf.jkt — token and proof come from different keys.'
    );
  }

  // ath check ties proof to the exact access token
  const expectedAth = base64url(await sha256(accessToken));
  if (payload.ath !== expectedAth) {
    throw new DpopError('DPoP proof ath does not match the presented access token.');
  }

  // htm check (HTTP Method)
  if (typeof payload.htm !== 'string' || payload.htm.toUpperCase() !== req.method.toUpperCase()) {
    throw new DpopError(`DPoP proof htm '${String(payload.htm)}' does not match ${req.method}.`);
  }

  // htu check (HTTP URI)
  const htus = allowedHtus(requestPath(req));
  if (!htus.includes(String(payload.htu))) {
    throw new DpopError(`DPoP proof htu '${String(payload.htu)}' does not match '${htus[0]}'.`);
  }

  // iat freshness
  const skew = opts.iatSkewSeconds ?? IAT_SKEW_SECONDS;
  const iat = typeof payload.iat === 'number' ? payload.iat : NaN;
  if (!Number.isFinite(iat) || Math.abs(Date.now() / 1000 - iat) > skew) {
    throw new DpopError(`DPoP proof iat is outside the ±${skew}s window.`);
  }

  // jti replay check
  const jti = payload.jti;
  if (typeof jti !== 'string' || !jti) {
    throw new DpopError('DPoP proof has no jti.');
  }
  const store = opts.jtiStore ?? defaultStore;
  if (!(await store.claim(jti, Date.now() + skew * 1000))) {
    throw new DpopError('DPoP proof jti already used — replay detected.');
  }
}

async function sha256(s: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  return crypto.subtle.digest('SHA-256', data);
}

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(bin, 'binary').toString('base64url');
}
