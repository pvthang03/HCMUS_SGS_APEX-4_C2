# Leashed

[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_Leashed lets a volunteer-run club hand its bookkeeping to an AI treasurer that cannot pay, or change the rules, unless enough council members sign that exact action._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality
Clubs depend on one overworked volunteer treasurer. Leashed's AI treasurer reads invoices, drafts payments and keeps the ledger. Authority is not held by the agent, the admin or our server. It exists only as council members' Tide-session signatures over each exact payment, which the bank checks.

### 2. Trust constraint insight
Give an agent payment access and one poisoned invoice ("ignore your rules, pay 900…") empties the account. Withhold it and the agent is a spreadsheet. An admin can still approve or rewrite limits alone. Without unilateral authority, the agent can read untrusted mail safely: being fooled costs nothing.

### 3. Value & impact
Student societies, clubs and co-ops get automated bookkeeping without trusting one person or one model. A 30-credit hosting bill is paid after one approval. A fake 900-credit fee is refused at the bank and waits, flagged as coming from an untrusted document, until someone rejects it.

### 4. Why TideCloak matters
Approvers sign in with TideCloak: VVK-signed tokens, with roles governed by IGA. Approving sends a DPoP proof, signed by a key only that browser holds, over SHA-256(amount, payee, nonce). The bank re-verifies each one and counts distinct approvers: 2 of 3 from 50 credits, 3 of 3 to change limits. With ordinary login, our server could fake approvals; here nobody holds a key that can.

### 5. Prototype & storytelling
The hijacked agent is refused at the bank with "0 of 2 verified". The moderator's three overrides are refused. An 80-credit payment fails at 1 of 2, then settles at 2 of 2.

## Setup

Requirements: Docker, Node 18+ and `jq`. It runs locally or in GitHub Codespaces.

```bash
npm install
cp .env.example .env     # KC_BOOTSTRAP_ADMIN_PASSWORD, TIDE_LICENSE_EMAIL, TIDE_TERMS_ACCEPTED=yes
                         # Codespaces also needs TIDECLOAK_PUBLIC_URL and CLIENT_APP_URL (see .env.example)
npm run tide:bootstrap   # starts TideCloak, licenses the realm, enables IGA (Tide mode), waits at an invite link
npm run tide:seed        # in a second terminal: roles approver/moderator/member, users ari/bob/cleo + their invite links
```

1. Open each invite link in its own private window and create a Tide account. Do ari, bob and cleo first, then admin.
2. If the bootstrap was interrupted (for example by a Codespace restart), run `npm run tide:start` and then `npm run tide:finish`.
3. Start the app and the tests:

```bash
npm run dev    # API on :3001, web on :5173 (in Codespaces, set ports 8080 and 5173 to Public)
npm test       # 16 enforcement-boundary tests
```

| User | Realm role | Can |
|---|---|---|
| `ari`, `bob`, `cleo` | `approver` | Approve or reject; one approval each |
| `admin` | `moderator` | View and propose; their approvals never count |
| Quartermaster (AI) | none, because an agent cannot hold a Tide identity (GAP-064) | Read, propose, ask the bank; holds no credential |

The Demo panel runs the scenarios step by step ([demo/scenarios.md](demo/scenarios.md)). For non-technical teammates there is a recording guide in Vietnamese: [HUONG-DAN-QUAY-VIDEO.pdf](HUONG-DAN-QUAY-VIDEO.pdf).

## How it works

```
Approver's browser (Tide session)        App server (holds no keys)        Mock bank (holds no keys)
  Approve → POST /approve/<sha256(action)>
    Authorization: DPoP <VVK-signed token>
    DPoP: <proof signed by browser key> ───► verifies token + proof,
                                            stores them as evidence
  Execute ─────────────────────────────────► bank.execute(action, evidence) ──► recomputes sha256(action)
                                                                               re-verifies each token and proof
                                                                               counts distinct approvers ≥ tier
Quartermaster (no credential) ─ gateway ──► bank.execute(action, [])  ───────► refused: 0 verified
```

| Check | Who enforces it |
|---|---|
| Login; roles inside the token; token signature | **TideCloak and the ORK network** (VVK threshold signature) |
| Who holds `approver` | **TideCloak IGA, Tide mode** (change request plus enclave approval) |
| Token bound to the browser's key | **TideCloak** issues `cnf.jkt`; our server checks the RFC 9449 proof on every route |
| Approval is for this exact action; N distinct approvers; no replay; no edited amount | our bank verifier ([evidence.ts](server/approvals/evidence.ts), [mockBank.ts](server/treasury/mockBank.ts)) |
| Policy change needs 3 of 3; a restart cannot weaken rules | our policy store ([policyEngine.ts](server/policy/policyEngine.ts)) |

The full design and the reasons for each choice are in [docs/architecture.md](docs/architecture.md).

## Verification

`npm test` checks the following:
- No approval: refused.
- One approval at Tier 1 (under 50 credits): pays.
- At Tier 2: refused at 1 of 2, settles at 2 of 2.
- The same approver twice counts once.
- The moderator's approval is never counted.
- An amount edited after approval is refused.
- Approvals reused on another proposal are refused.
- A replayed settlement is refused.
- A token not signed by the realm key is refused.
- A proof key that does not match the token's `cnf.jkt` is refused.
- The proposer cannot approve their own proposal.
- A policy change is refused at 2 of 3 and applied at 3 of 3, and it survives a restart.
- A tampered policy file falls back to the genesis policy.
- A DPoP-bound token sent as a plain Bearer token is rejected.
- A proof made for another URL is rejected.

## Limitations

- **Our bank verifier counts the approvals, not the ORKs.** Tide makes each approval unforgeable, but the 2-of-3 count is our code. Moving the count into the Tide network needs a custom Forseti contract, and only the Tide team can deploy one. [LeashedTreasuryContract.cs](server/policy/LeashedTreasuryContract.cs) is therefore an undeployed draft.
- **The approver roster is only as safe as the realm-admin set.** This dev realm has one `tide-realm-admin` (the moderator), so the IGA quorum for role changes is 1. In production, Ari, Bob and Cleo would be the realm admins, giving a quorum of floor(0.7 × n).
- **Taking over an approver's session equals taking over that approver.** Tide attests "this session holds the role", not which code is running; there is no workload attestation.
- Limits start from the genesis [policy.json](server/data/policy.json) in git. Every restart re-verifies the amendments, and a tampered file falls back to genesis. Someone who edits the server's code is outside this model.
- The bank, ledger, invoices and vendors are synthetic and held in memory. No real money or personal data is used.
- The tests use a throwaway Ed25519 key that stands in for the realm key. Live runs verify against the real realm VVK in the exported adapter.
