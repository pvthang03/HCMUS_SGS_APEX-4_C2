# Leashed
*An AI treasurer for a community guild that can do the work but cannot move money alone.*

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

## Project overview

### 1. Vision & originality
An AI agent you can safely point at untrusted invoices. The Quartermaster reads mail, drafts payments and keeps the books. It holds no credential that can spend. Neither the moderator nor our server can spend alone either.

### 2. Trust constraint insight
A useful agent needs broad access, so one poisoned invoice can drain the treasury. Restrict it and it is useless. Whoever runs the backend can always override the rules. Leashed separates *doing the work* from *authority*: authority exists only when enough humans sign the exact action.

### 3. Value & impact
For guilds, clubs, co-ops and small non-profits, a fully hijacked agent or a rogue admin cannot cause a loss. They can only file a proposal that approvers see flagged with its untrusted source.

### 4. Why TideCloak matters
An approval is not a database row. It is the approver's VVK-signed TideCloak token plus a DPoP proof signed by a key that only their browser holds. The proof signs a URL containing the SHA-256 of the exact amount, payee and nonce. The bank re-verifies these signatures against the realm VVK and counts distinct `approver` identities.

With ordinary login, the server could mint tokens or insert approval rows and the admin could call the payment API. Here neither holds any key that can produce a valid approval. Who holds `approver` is governed by TideCloak IGA (Tide mode).

### 5. Prototype & storytelling
Watch the poisoned invoice hijack the agent: its direct bank call is refused with *0 of 2 approvals*. The moderator's approve, direct-payment and policy-weakening attempts are refused. An 80-credit payment executes after Ari and Cleo approve from their own Tide sessions.

---

## Setup

Needs Docker, Node 18+, `jq`. Works locally or in GitHub Codespaces.

```bash
npm install
cp .env.example .env            # set KC_BOOTSTRAP_ADMIN_PASSWORD, TIDE_LICENSE_EMAIL, TIDE_TERMS_ACCEPTED=yes
                                # Codespaces: also TIDECLOAK_PUBLIC_URL and CLIENT_APP_URL (see .env.example)
npm run tide:bootstrap          # starts TideCloak, licenses the realm, enables IGA (Tide mode), exports the adapter
# while it waits at the invite-link step, in another terminal:
npm run tide:seed               # roles approver/moderator/member, users ari/bob/cleo, prints their invite links
```

Open each invite link in its own private window and create a Tide account (ari, bob, cleo first, then admin). Then:

```bash
npm run dev                     # API :3001, web :5173  (Codespaces: make ports 8080 and 5173 Public)
npm test                        # 16 enforcement-boundary tests
```

| User | Realm role | Can |
|---|---|---|
| `ari`, `bob`, `cleo` | `approver` | approve/reject; one approval each |
| `admin` | `moderator` (+ `tide-realm-admin`) | view, propose; approvals are not counted |
| Quartermaster | none (no Tide identity, GAP-064) | read, propose, ask the bank; holds no credential |

**Scenarios** (Demo panel): 1. agent proposes 30 credits, one approver approves, Execute. 2. Poisoned invoice. 3a. As `admin`: rogue attempts. 3b. 80 credits: Execute is refused at 1 of 2 and settles after a second approver signs in another browser profile. Policy change (Tier 3) needs 3 of 3.

## Limitations

- **Who counts approvals is our bank verifier, not the ORKs.** Tide makes each approval unforgeable. The 2-of-3 count is code in [server/approvals/evidence.ts](server/approvals/evidence.ts). Moving the count into the Tide network needs a custom Forseti contract. Deploying one is done by the Tide team, so [LeashedTreasuryContract.cs](server/policy/LeashedTreasuryContract.cs) is an undeployed draft.
- **Roster governance is only as strong as the realm-admin set.** This dev realm has one `tide-realm-admin` (the moderator), so the IGA quorum for role changes is 1. In production, Ari, Bob and Cleo would be the realm admins, giving a quorum of floor(0.7 × n).
- **Session compromise equals approver compromise.** Tide attests "this session holds the role", not which code runs (no workload attestation).
- Limits come from the genesis [policy.json](server/data/policy.json) in git. Amendments are re-verified on every start, and a tampered file falls back to genesis. A server operator who edits the code itself is outside this model.
- The bank, ledger, invoices and vendors are synthetic and in memory. No real money or PII is used.
- Tests use a throwaway in-memory Ed25519 key as a stand-in realm key. Live runs verify against the realm VVK in the exported adapter.
