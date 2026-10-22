import { jwtVerify, createLocalJWKSet } from 'jose';
import type { JWTPayload, JWTVerifyOptions } from 'jose';
import { loadTideConfig } from './tidecloakConfig.js';

let _jwks: ReturnType<typeof createLocalJWKSet> | null = null;
let _config: ReturnType<typeof loadTideConfig> | null = null;

function getConfig() {
  if (!_config) {
    _config = loadTideConfig();
    _jwks = createLocalJWKSet(_config.jwk);
  }
  return { config: _config, JWKS: _jwks! };
}

/**
 * Verify a TideCloak access token against the realm VVK embedded in the adapter (Invariant I-04).
 * `currentDate` lets the bank re-check archived approval evidence as of the moment it was signed.
 */
export async function verifyTideJWT(
  token: string,
  opts: { currentDate?: Date } = {}
): Promise<JWTPayload> {
  const { config, JWKS } = getConfig();

  const options: JWTVerifyOptions = {
    issuer: `${config['auth-server-url'].replace(/\/+$/, '')}/realms/${config.realm}`,
    algorithms: ['EdDSA'],
    clockTolerance: 10,
    currentDate: opts.currentDate
  };

  const { payload } = await jwtVerify(token, JWKS, options);

  // TideCloak access tokens use azp (authorized party) for the client ID
  if (payload.azp !== config.resource) {
    throw new Error(`Token azp mismatch: expected ${config.resource}, got ${payload.azp}`);
  }

  return payload;
}

export function hasRole(payload: JWTPayload, role: string): boolean {
  // Check realm roles
  const realmRoles = (payload.realm_access as any)?.roles || [];
  if (Array.isArray(realmRoles) && realmRoles.includes(role)) {
    return true;
  }

  // Check client roles
  const resourceAccess = payload.resource_access as any;
  if (resourceAccess) {
    for (const client of Object.values(resourceAccess)) {
      const clientRoles = (client as any)?.roles || [];
      if (Array.isArray(clientRoles) && clientRoles.includes(role)) {
        return true;
      }
    }
  }

  return false;
}

export function extractToken(authHeader: string | null | undefined): { scheme: 'Bearer' | 'DPoP'; token: string } {
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  if (authHeader.startsWith('Bearer ')) {
    return { scheme: 'Bearer', token: authHeader.substring(7).trim() };
  }

  if (authHeader.startsWith('DPoP ')) {
    return { scheme: 'DPoP', token: authHeader.substring(5).trim() };
  }

  throw new Error('Invalid Authorization header format: Must start with Bearer or DPoP');
}
