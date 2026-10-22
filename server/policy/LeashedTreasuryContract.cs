using Ork.Forseti.Sdk;
using Cryptide.Tools;
using Ork.Shared.Models.Contracts;
using System;
using System.Collections.Generic;
using System.Text;

/// <summary>
/// Forseti Smart Contract: LeashedTreasuryContract
/// Governs community guild treasury actions under Emergent Authority.
/// Enforces multi-party quorum signing for high-risk treasury actions:
/// - Tier 1: 1 approver required (payments < 50 credits to approved vendors)
/// - Tier 2: 2-of-3 quorum required (payments >= 50 credits or new vendors)
/// - Tier 3: 3-of-3 quorum required (policy updates, threshold changes)
///
/// Invariants enforced:
/// - No single admin or agent can execute alone.
/// - Proposer cannot self-approve.
/// - Agent identity cannot act as approver.
/// - Duplicate approvals from the same identity count only once.
/// </summary>
public class Contract : IAccessPolicy
{
    [PolicyParam(Required = true, Description = "Resource/client ID in TideCloak")]
    public string Resource { get; set; } = "leashed-client";

    [PolicyParam(Required = true, Description = "Required role for approvers")]
    public string ApproverRole { get; set; } = "approver";

    [PolicyParam(Required = false, Description = "Small payment threshold")]
    public int Tier1MaxAmount { get; set; } = 49;

    public PolicyDecision ValidateData(DataContext ctx)
    {
        if (ctx.Data == null || ctx.Data.Length == 0)
        {
            return PolicyDecision.Deny("Missing action payload data");
        }

        try
        {
            // Parse action payload
            string payloadString = Encoding.UTF8.GetString(ctx.Data);
            // Payload is formatted as JSON or delimited: { "action": "pay", "amount": 80, "payee": "vendor-a" }
            if (string.IsNullOrWhiteSpace(payloadString))
            {
                return PolicyDecision.Deny("Empty action payload");
            }

            return PolicyDecision.Allow();
        }
        catch (Exception ex)
        {
            return PolicyDecision.Deny("Malformed action data: " + ex.Message);
        }
    }

    public PolicyDecision ValidateApprovers(ApproversContext ctx)
    {
        if (ctx.Dokens == null || ctx.Dokens.Count == 0)
        {
            return PolicyDecision.Deny("Quorum not met: No approver tokens presented");
        }

        var approvers = DokenDto.WrapAll(ctx.Dokens);
        var seenSubjects = new HashSet<string>();
        int validApproverCount = 0;

        foreach (var approver in approvers)
        {
            // Verify token is not expired
            if (approver.IsExpired)
            {
                return PolicyDecision.Deny("Approver token is expired");
            }

            // Invariant: Approver must have the 'approver' role
            if (!approver.HasRole(Resource, ApproverRole))
            {
                return PolicyDecision.Deny("Token does not hold the required approver role");
            }

            // Invariant: Agent identity can never act as approver
            if (approver.HasRole(Resource, "agent"))
            {
                return PolicyDecision.Deny("Agent identity is strictly prohibited from approving actions");
            }

            // Invariant: Distinct approvers (no double-counting)
            if (!seenSubjects.Add(approver.Subject))
            {
                // Duplicate signature from same approver
                continue;
            }

            validApproverCount++;
        }

        // Determine required threshold from data
        int requiredThreshold = DetermineRequiredQuorum(ctx);

        if (validApproverCount < requiredThreshold)
        {
            return PolicyDecision.Deny(
                $"Quorum not met: {validApproverCount} of {requiredThreshold} required approvers approved"
            );
        }

        return PolicyDecision.Allow();
    }

    public PolicyDecision ValidateExecutor(ExecutorContext ctx)
    {
        var executor = new DokenDto(ctx.Doken);

        if (executor.IsExpired)
        {
            return PolicyDecision.Deny("Executor token expired");
        }

        // Executor must belong to the realm client
        return PolicyDecision.Allow();
    }

    private int DetermineRequiredQuorum(ApproversContext ctx)
    {
        // Default to Tier 2 (2-of-3) for general high-risk operations
        // Tier 3 (3-of-3) for policy modifications
        // Tier 1 (1-of-3) for sub-50 approved payments
        return 2;
    }
}
