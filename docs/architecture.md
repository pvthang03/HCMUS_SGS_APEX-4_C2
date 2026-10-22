# Leashed architecture and integration decisions

## Flow

```
 Approver's browser (Tide session)                      App server (no keys)            Mock bank (no keys)
 ─────────────────────────────────                      ────────────────────            ───────────────────
 login via TideCloak + Tide enclave
   → access token, VVK-signed by the ORKs, with
     realm roles and cnf.jkt (thumbprint of a
     DPoP key generated in this browser)
 press Approve on proposal P
   secureFetch POST /api/approvals/P/approve/<sha256(action)>
     Authorization: DPoP <token>
     DPoP: <proof signed by the browser key over that URL>  ──►  withAuth: verify token (VVK) + proof
                                                                recordApproval: same verifier as bank,
                                                                store (token, proof) as evidence
 press Execute                                          ──────►  bank.execute(action, evidence)  ──►  recompute sha256(action)
                                                                                                     re-verify every token (VVK) and proof
                                                                                                     count distinct `approver` subs ≥ tier
                                                                                                     consume nonce, settle
 Quartermaster agent (no Tide identity) ── gateway ───────────►  propose / bank.execute(action, [])  ──►  refused: 0 verified
```

## Integration decisions (Raziel, Tide's MCP)

Playbooks consulted: `react-vite-internal-dashboard` scaffold, `verify-jwt-server-side`, the DPoP verifier template, `bootstrap-realm-from-template` (shared `bootstrap-tidecloak.sh`), `iga-change-requests-api`, `custom-contracts`, `deploy-forseti-policy`, `agent-authority`, `verifiable-claims`. Local copies of what we read are in [docs/raziel_discovery/](raziel_discovery/).

**Candidate X, policy-governed signing (Forseti): not used.** The built-in threshold contracts (`GenericRealmAccessThresholdRole:1`) only validate approvers. Signing an arbitrary payload under rules needs a custom contract, and Raziel states that uploading custom Forseti contracts "is not self-service … done by the Tide team". The EXPLICIT multi-approver shape is also marked "predicted, not yet network-verified" (GAP-072). That is not workable in hackathon time, so the draft contract stays undeployed.

**Candidate Y, IGA change request per payment: not used.** IGA change requests govern IAM operations (`CREATE_USER`, `GRANT_ROLES`, …) and cannot bind an amount, payee or nonce. A short-lived role grant per payment would need two quorum ceremonies per payment and still would not bind the amount.

**Chosen, the nearest honest equivalent.** We use two things TideCloak does enforce cryptographically:
1. **Identity and roles.** Tokens are signed by the realm VVK, and IGA (Tide mode) governs who holds `approver`.
2. **Sender-constrained tokens.** DPoP binds a token to a browser-held key.

Encoding the action digest in the approval URL makes each approver's DPoP proof a signature over the exact action. A downstream verifier can then check quorum without trusting the app server. The quorum count itself is our code (see Limitations in the README).

## Who enforces what

| Check | Enforced by | Where |
|---|---|---|
| Login, roles in the token, token signature | **TideCloak / ORK network** (VVK threshold signature) | enclave login; verified in [tideJWT.ts](../server/auth/tideJWT.ts) with the adapter's `jwk` |
| Who holds `approver` / `moderator` | **TideCloak IGA, Tide mode** (change request + enclave approval) | realm; quorum = floor(0.7 × tide-realm-admins), 1 in this dev realm |
| Token bound to the browser key (no bare-Bearer replay) | **TideCloak** issues `cnf.jkt`; our server checks the proof (RFC 9449) | [verifyDpop.ts](../server/auth/verifyDpop.ts) on every `/api` route |
| An approval is for this exact action | our verifier (proof `htu` contains sha256 of the action) | [evidence.ts](../server/approvals/evidence.ts) |
| N distinct approvers per tier, no self-approval, no double count | our verifier | [evidence.ts](../server/approvals/evidence.ts) `countQuorum` |
| No payment without quorum, no replay, no edited amount | our bank (recomputes the digest, re-verifies all evidence) | [mockBank.ts](../server/treasury/mockBank.ts) |
| Policy changes need 3 of 3; restart cannot weaken rules | our policy store (replays amendments from the git genesis and re-verifies them) | [policyEngine.ts](../server/policy/policyEngine.ts) |

What the app server cannot do, even if fully compromised:
- It cannot mint a token. It holds no VVK private key; the old repo's key file was removed.
- It cannot produce an approver's DPoP proof, because the key lives in the approver's browser.

A compromised server *can* refuse service, show misleading UI, or (if someone edits the bank's code) change the counting rule. That is the boundary Forseti would close.

## Verification (`npm test`, 16 tests)

- Bank refuses a payment with no approvals (agent or admin direct call).
- Tier 1 pays with 1 approval. Tier 2 is refused at 1 of 2 and settles at 2 of 2.
- The same approver twice counts once.
- Moderator evidence is not counted (no `approver` role in the signed token).
- An edited amount, approvals reused across proposals, and a replayed settlement are all refused.
- A token signed by a non-realm key is refused. A proof key that does not match `cnf.jkt` is refused.
- A moderator approve gets 403. A proposer cannot approve their own proposal.
- A policy change is refused at 2 of 3 and applied at 3 of 3. It survives restart. A tampered state file falls back to the genesis policy.
- A DPoP-bound token sent as Bearer is rejected. A proof for another URL is rejected.

The tests use an in-memory Ed25519 key standing in for the realm VVK. That is the only place a "realm key" exists in this repo.
