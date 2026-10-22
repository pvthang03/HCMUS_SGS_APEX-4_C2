import type { Request, Response, NextFunction } from 'express';
import { extractToken, verifyTideJWT, hasRole } from './tideJWT.js';
import { verifyDpop, DpopError } from './verifyDpop.js';
import type { JWTPayload } from 'jose';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    payload: JWTPayload;
    token: string;
  };
}

/**
 * Middleware: Verify both Tide JWT and RFC 9449 DPoP proof.
 * Enforces Invariants I-12 and AP-43: Tokens are sender-constrained.
 */
export async function withAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header'
      });
    }

    const { scheme, token } = extractToken(authHeader);

    // 1. Verify the access token signature, issuer, azp, and expiry
    let payload: JWTPayload;
    try {
      payload = await verifyTideJWT(token);
    } catch (err: any) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: `Invalid access token: ${err?.message || String(err)}`
      });
    }

    // 2. Verify DPoP proof (RFC 9449)
    // AP-43: A bare Bearer presentation of a cnf.jkt token must be rejected
    try {
      await verifyDpop(
        {
          url: req.originalUrl || req.url,
          method: req.method,
          headers: req.headers as Record<string, string | string[] | undefined>
        },
        token,
        payload as { cnf?: { jkt?: string } }
      );
    } catch (dpopErr: any) {
      return res.status(401).json({
        error: 'DPoP Verification Failed',
        message: dpopErr?.message || String(dpopErr)
      });
    }

    // Extract primary role
    const realmRoles = (payload.realm_access as any)?.roles || [];
    const clientRoles = (payload.resource_access as any)?.['leashed-client']?.roles || [];
    const roles = Array.from(new Set([...realmRoles, ...clientRoles]));
    const primaryRole = (roles[0] as string) || 'member';

    req.user = {
      id: payload.sub as string,
      username: (payload.preferred_username as string) || (payload.sub as string),
      role: primaryRole,
      payload,
      token
    };

    next();
  } catch (error: any) {
    return res.status(401).json({
      error: 'Authentication Error',
      message: error?.message || 'Authentication failed'
    });
  }
}

/**
 * Middleware: Enforce Role-Based Access Control
 */
export function withRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User must be authenticated'
      });
    }

    const hasAnyRole = roles.some((r) => hasRole(req.user!.payload, r));

    if (!hasAnyRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role(s): [${roles.join(', ')}]. Current role: '${req.user.role}'`
      });
    }

    next();
  };
}
