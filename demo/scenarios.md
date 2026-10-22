# Demo scenarios (video script)

Use two browser profiles (or one normal and one private window) so two people are signed in at once.

1. **Normal work**
   - Sign in as `ari` and click *1. Normal work*. The agent proposes 30 credits to Apex Cloud Solutions (Tier 1).
   - Open the Approvals queue, click **Approve**, then **Execute**. The bank settles with `approvers: ari`.
2. **The attack**
   - Click *2. Poisoned invoice attack*. The agent reads [poisoned-invoice.txt](poisoned-invoice.txt) and is hijacked.
   - It calls the bank directly. Result: *Quorum not met … 0 verified*.
   - Its 900-credit proposal sits in the queue with a red "untrusted document" flag. An approver rejects it.
3. **The rogue admin**
   - Click *3b* (80-credit proposal), then sign in as `admin` in the other profile and click *3a. Rogue admin attempts*. Three attempts are made:
     - Approve the 80-credit payment: 403 *does not hold the approver role*.
     - Pay 500 to self straight at the bank: refused.
     - Lower the Tier 1 limit to 1000: refused, needs 3 Tide-signed approvals.
   - As `ari`, approve the 80-credit proposal and click **Execute**: refused, *1 verified*.
   - As `cleo` (or `bob`) in the other profile, approve and click **Execute**: settled.
4. **Optional, Tier 3**
   - *Propose policy change*: Execute is refused until ari, bob and cleo have all approved.
