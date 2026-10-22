import { createHash } from 'crypto';
import {
  jwtVerify,
  importJWK,
  calculateJwkThumbprint,
  decodeProtectedHeader,
  type JWK,
  type JWTPayload
} from 'jose';
import { verifyTideJWT, hasRole } from '../auth/tideJWT.js';
import { publicUrl } from '../auth/verifyDpop.js';

/**
 * Approval evidence = the two artefacts an approver's own Tide session produces when they
 * press "Approve" on one specific action:
 *
 *   accessToken  issued by TideCloak and signed by the realm VVK (threshold-signed by the ORKs).
 *                Carries the approver's roles and cnf.jkt, the thumbprint of a key that lives
 *                only in the approver's browser.
 *   dpopProof    an RFC 9449 proof signed by that browser key for
 *                POST {app}/api/approvals/{id}/approve/{digest}.
 *
 * The digest in the signed URL is the SHA-256 of the exact action (amount, payee, nonce, ...),
 * so the pair is a signature by "a holder of the approver role" over "this exact action".
 * Nothing on the app server can produce one: it holds neither the VVK private key nor any
 * approver's DPoP private key. That is why the bank can re-verify evidence from scratch.
 */
export interface ApprovalEvidence {
  accessToken: string;
  dpopProof: string;
}

export interface VerifiedApproval {
  sub: string;
  username: string;
  approvedAt: number;
}

export class EvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export function approvalPath(proposalId: string, digest: string): string {
  return `/api/approvals/${proposalId}/approve/${digest}`;
}

/** Canonical JSON: sorted keys, so the digest does not depend on property order. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(',')}}`;
}

export function actionDigest(action: unknown): string {
  return createHash('sha256').update(canonicalJson(action)).digest('hex');
}

function b64urlSha256(s: string): string {
  return createHash('sha256').update(s).digest('base64url');
}

export async function verifyApprovalEvidence(
  evidence: ApprovalEvidence,
  expected: { proposalId: string; digest: string; maxAgeSeconds?: number }
): Promise<VerifiedApproval> {
  if (!evidence?.accessToken || !evidence?.dpopProof) {
    throw new EvidenceError('Evidence is missing the access token or the DPoP proof.');
  }

  // 1. The proof is signed by the key embedded in its own header.
  let header: ReturnType<typeof decodeProtectedHeader>;
  try {
    header = decodeProtectedHeader(evidence.dpopProof);
  } catch {
    throw new EvidenceError('DPoP proof is not a compact JWS.');
  }
  if (header.typ !== 'dpop+jwt' || !header.jwk) {
    throw new EvidenceError('DPoP proof has the wrong typ or no embedded jwk.');
  }
  let proof: JWTPayload & { htm?: string; htu?: string; ath?: string };
  try {
    const key = await importJWK(header.jwk as JWK, header.alg);
    proof = (await jwtVerify(evidence.dpopProof, key)).payload as typeof proof;
  } catch (e: any) {
    throw new EvidenceError(`DPoP proof signature invalid: ${e?.message || e}`);
  }
  if (typeof proof.iat !== 'number') throw new EvidenceError('DPoP proof has no iat.');

  // 2. The access token was a valid, VVK-signed TideCloak token at the moment of approval.
  let claims: JWTPayload;
  try {
    claims = await verifyTideJWT(evidence.accessToken, { currentDate: new Date(proof.iat * 1000) });
  } catch (e: any) {
    throw new EvidenceError(`Access token not signed by the realm VVK: ${e?.message || e}`);
  }

  // 3. Proof key == the key TideCloak bound into the token.
  const jkt = (claims.cnf as { jkt?: string } | undefined)?.jkt;
  if (!jkt || (await calculateJwkThumbprint(header.jwk as JWK, 'sha256')) !== jkt) {
    throw new EvidenceError('DPoP key does not match the token cnf.jkt.');
  }
  if (proof.ath !== b64urlSha256(evidence.accessToken)) {
    throw new EvidenceError('DPoP proof ath does not match the access token.');
  }

  // 4. The signed request is "approve THIS action".
  const expectedHtu = publicUrl(approvalPath(expected.proposalId, expected.digest));
  if (proof.htm !== 'POST' || proof.htu !== expectedHtu) {
    throw new EvidenceError(`Proof signs '${proof.htm} ${proof.htu}', not '${expectedHtu}'.`);
  }

  // 5. The signer held the approver role (roles are VVK-signed; IGA governs who gets them).
  if (!hasRole(claims, 'approver')) {
    throw new EvidenceError(`'${claims.preferred_username}' does not hold the approver role.`);
  }

  if (expected.maxAgeSeconds !== undefined) {
    const age = Date.now() / 1000 - proof.iat;
    if (age > expected.maxAgeSeconds || age < -60) {
      throw new EvidenceError(`Approval is ${Math.round(age)}s old; limit is ${expected.maxAgeSeconds}s.`);
    }
  }

  return {
    sub: String(claims.sub),
    username: String(claims.preferred_username || claims.sub),
    approvedAt: proof.iat
  };
}

/**
 * Count distinct, valid approvers. Invalid evidence is reported, never silently counted.
 */
export async function countQuorum(
  evidences: ApprovalEvidence[],
  expected: { proposalId: string; digest: string; maxAgeSeconds?: number; excludeSub?: string }
): Promise<{ approvers: VerifiedApproval[]; rejected: string[] }> {
  const approvers: VerifiedApproval[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();
  for (const ev of evidences) {
    try {
      const v = await verifyApprovalEvidence(ev, expected);
      if (expected.excludeSub && v.sub === expected.excludeSub) {
        rejected.push(`${v.username}: proposer cannot approve their own proposal`);
      } else if (seen.has(v.sub)) {
        rejected.push(`${v.username}: duplicate approval not counted`);
      } else {
        seen.add(v.sub);
        approvers.push(v);
      }
    } catch (e: any) {
      rejected.push(e?.message || String(e));
    }
  }
  return { approvers, rejected };
}
