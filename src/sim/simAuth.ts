// Plan C client: stands in for the TideCloak SDK when the server runs with LEASHED_IDP=sim.
// The DPoP key is generated here with WebCrypto as NON-extractable, and every request carries an
// RFC 9449 proof signed by it, exactly like the SDK's secureFetch. Only the token issuer is simulated.

export interface SimSession {
  username: string;
  token: string;
  secureFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const b64urlJson = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));

export async function simLogin(username: string): Promise<SimSession> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const full = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const jwk = { kty: full.kty, crv: full.crv, x: full.x, y: full.y };

  const res = await fetch('/api/sim/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, dpopJwk: jwk })
  });
  if (!res.ok) throw new Error((await res.json()).message || 'Simulated login failed');
  const { accessToken } = await res.json();
  const ath = b64url(await crypto.subtle.digest('SHA-256', enc.encode(accessToken)));

  async function proof(method: string, url: string) {
    const u = new URL(url);
    const signingInput = `${b64urlJson({ typ: 'dpop+jwt', alg: 'ES256', jwk })}.${b64urlJson({
      jti: crypto.randomUUID(),
      htm: method,
      htu: u.origin + u.pathname,
      iat: Math.floor(Date.now() / 1000),
      ath
    })}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, enc.encode(signingInput));
    return `${signingInput}.${b64url(sig)}`;
  }

  return {
    username,
    token: accessToken,
    secureFetch: async (url, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `DPoP ${accessToken}`);
      headers.set('DPoP', await proof((init.method || 'GET').toUpperCase(), url));
      return fetch(url, { ...init, headers });
    }
  };
}
