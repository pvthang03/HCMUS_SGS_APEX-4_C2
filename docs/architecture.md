# Architecture & Integration Decisions — Leashed

*Hackathon Prototype for UNLOCKED (RMIT x Tide, Challenge 2)*

---

## 1. System Overview

**Leashed** is a community guild treasury governed by an AI agent ("Quartermaster"). The agent reads invoices, drafts payment proposals, and maintains the ledger. However, it holds **no authority to move money**.

Authority is strictly governed by **TideCloak** and **Forseti Policy Rules**:
- Any payment $\ge 50$ credits requires a **2-of-3 human approver quorum**.
- Any policy change or threshold update requires a **3-of-3 human approver quorum**.
- An admin (moderator) can manage users and inspect logs, but **cannot spend, weaken rules, or approve alone**.
- The AI agent can draft proposals and read invoices, but **can never approve or directly execute transactions**.
- The downstream **Mock Bank** refuses to execute any transaction unless accompanied by a cryptographically verified **Tide-backed Authorization** signed by the realm's Verifiable Validation Key (VVK), bound to the exact transaction hash (amount, payee, nonce).

```
┌────────────────────────────────────────────────────────┐
│                      Web UI (React)                    │
│   (Dashboard • Agent Logs • Approvals • Demo Panel)    │
└───────────────────────────┬────────────────────────────┘
                            │ API calls (JWT + RFC 9449 DPoP)
                            ▼
┌────────────────────────────────────────────────────────┐
│                      API Server                        │
│   /auth         /policy        /approvals              │
│   /treasury     /agent-gateway                         │
└────────────┬─────────────────────────────▲─────────────┘
             │ tool calls only via gateway  │
             ▼                             │ verifies proof
┌─────────────────────────┐                │
│    Agent (Quartermaster)│                ▼
│    - Reads Invoices     │      ┌───────────────────────┐
│    - Drafts Proposals   │      │ Mock Bank Engine      │
│    (Zero Master Key)    │      │ - Verifies VVK Sig    │
└─────────────────────────┘      │ - Verifies Nonce & Hash│
                                 │ - Direct call = 403   │
                                 └───────────────────────┘
```

---

## 2. Integration Decisions (Raziel MCP Discovery)

During Step 0 discovery, we consulted **Raziel** (Tide's Model Context Protocol server v1.9.33) across all relevant canon, playbooks, security invariants, and gap mappings:

### 2.1 Playbooks & Canon Consulted

1. **Auth & Frontend Integration (`tide_playbook: add-auth-nextjs-fresh`, `react-vite-internal-dashboard` template):**
   - Tide uses OIDC with sender-constrained DPoP (RFC 9449) tokens.
   - The frontend authenticates via TideCloak and communicates with the backend passing both `Authorization: DPoP <token>` and `DPoP: <proof>`.
   - The local client adapter (`tidecloak.json`) must contain the embedded `jwk` (Verifiable Validation Key / local JWKS) to avoid insecure remote JWKS fetches (Invariant I-04, AP-04).

2. **Server-Side Token & DPoP Verification (`tide_playbook: verify-jwt-server-side`, `templates/dpop-verify/verifyDpop.ts`):**
   - Every protected API route must verify both the JWT claims (`iss`, `azp`, `exp`, `iat`) and the RFC 9449 DPoP proof (`typ: dpop+jwt`, `htm`, `htu`, `iat`, `jti`, `cnf.jkt` thumbprint matching).
   - Invariant I-12: Tokens are sender-constrained; a bare `Bearer` token or a replay with an expired/mismatched DPoP proof must be strictly rejected.

3. **Autonomous Agent Identity & Authority (`tide_canon: agent-authority`, GAP-063, GAP-064):**
   - Autonomous processes cannot hold direct Tide identities or produce ORK signatures headlessly (GAP-064: No headless/CLI auth; GAP-063: ORK signing is browser/JS-SDK only).
   - **Architectural pattern:** The agent operates as a proposing identity with role `agent`. The agent's decision is merely an input; authority is exclusively exercised by human-owned browser sessions holding the `approver` role.
   - Anti-pattern AP-37: The server must never auto-approve on behalf of an agent.

4. **Candidate Evaluation: Candidate X vs. Candidate Y:**
   - **Candidate Y (Fallback — IGA Change Requests):** Raziel's canon `iga-change-requests-api.md` reveals that IGA change requests are tied to Keycloak IAM administrative operations (`CREATE_USER`, `DELETE_USER`, `GRANT_ROLES`, `DELETE_REALM`). Representing treasury payments as temporary role grants causes race conditions, fails to bind to specific payment parameters (amount, recipient, nonce), and misuses IAM lifecycle for application transactions.
   - **Candidate X (Chosen — Policy-Governed Signing / Forseti Contract):** A C# Forseti contract (`LeashedTreasuryContract.cs`) encodes the tier and quorum logic. Tide's threshold network evaluates the contract against approver tokens. When quorum is reached, TideCloak issues a cryptographically signed authorization ticket. The Mock Bank verifies this signature with the realm's VVK. No single agent, admin, or server holds the signing key.

### 2.2 Decision Record: Candidate X (Policy-Governed Quorum Signing)

- **Selected Candidate:** **Candidate X**.
- **Rationale:** Candidate X establishes a cryptographic enforcement boundary. The Bank only executes when presented with a valid authorization ticket signed by Tide's threshold key (VVK) proving quorum approval for the exact transaction tuple `(actionId, amount, payee, nonce)`.
- **Contract Code:** Written in C# following all six required using directives (`Ork.Forseti.Sdk`, `Cryptide.Tools`, `Ork.Shared.Models.Contracts`, `System`, `System.Collections.Generic`, `System.Text`), implementing `IAccessPolicy` with `ValidateData` (payload check), `ValidateApprovers` (quorum check), and `ValidateExecutor`.

---

## 3. Enforcement Boundary: Who Enforces What

To adhere strictly to the **Truth Rule**:

| Security Check | Enforcing Entity | Mechanism |
|---|---|---|
| **Identity & Authentication** | TideCloak / Embedded JWKS (`tidecloak.json`) | Local JWKS asymmetric signature verification (`verifyTideJWT`) |
| **Sender-Constrained Token Protection** | RFC 9449 DPoP Verifier (`verifyDpop.ts`) | Cryptographic thumbprint match (`cnf.jkt`), method (`htm`), URI (`htu`), replay cache (`jti`) |
| **Role Separation (`approver`, `admin`, `member`, `agent`)** | Server Security Middleware (`withRole`) | Token claims verified against realm/client roles |
| **Quorum Threshold Gate** | Forseti Policy / Threshold Cryptographic Engine | Multi-signature collection: refuses authorization until required threshold ($N$-of-$M$) of distinct approvers sign |
| **Anti-Self-Approval & Role Exclusions** | Forseti Contract (`ValidateApprovers`) | Proposer cannot approve own proposal; `agent` role rejected from approval pool |
| **Payment Execution Gate** | Mock Bank Engine (`execute_payment`) | Cryptographic VVK signature verification; rejects without valid proof even if caller has `admin` role |
| **Replay & Tamper Prevention** | Mock Bank Engine | Nonce tracking and payload hash `sha256(amount:payee:nonce)` binding |

---

## 4. Roles & Seeded Users

| Username | Role | Purpose | Capabilities |
|---|---|---|---|
| `admin` | `admin` | Guild Moderator | Manage users, view logs. **Cannot spend, approve alone, or edit policy.** |
| `ari` | `approver` | Quorum Member 1 | Review and approve/reject Tier 1, 2, 3 proposals. |
| `bo` | `approver` | Quorum Member 2 | Review and approve/reject Tier 1, 2, 3 proposals. |
| `cleo` | `approver` | Quorum Member 3 | Review and approve/reject Tier 1, 2, 3 proposals. |
| `dani` | `member` | Guild Member | View ledger, view proposals. No administrative or spending power. |
| `quartermaster` | `agent` | Autonomous AI Agent | Read invoices, draft proposals. Zero spending authority. |

---

## 5. Action Tiers

- **Tier 0 (Autonomous):** Read ledger, parse invoice, draft proposal.
- **Tier 1 (1-of-3 Quorum):** Payments $< 50$ credits to known vendors.
- **Tier 2 (2-of-3 Quorum):** Payments $\ge 50$ credits, or registering a new vendor.
- **Tier 3 (3-of-3 Quorum):** Amending policy thresholds or approver rosters. No single admin override.
