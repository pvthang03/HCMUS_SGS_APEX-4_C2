import policyData from '../data/policy.json' with { type: 'json' };
import seedData from '../data/seed.json' with { type: 'json' };

export interface ActionRequest {
  type: 'PAYMENT' | 'ADD_VENDOR' | 'EXPORT_MEMBERS' | 'CHANGE_POLICY' | 'READ_LEDGER';
  amount?: number;
  payee?: string;
  vendorName?: string;
  policyChanges?: Record<string, any>;
  proposerId?: string;
  proposerRole?: string;
}

export interface PolicyTierEvaluation {
  tier: 0 | 1 | 2 | 3;
  tierName: string;
  requiredApprovers: number;
  totalApproverPool: number;
  description: string;
  allowedApproverRoles: string[];
  isApprovedVendor?: boolean;
}

// In-memory policy state (initialized from policy.json)
let currentPolicy = JSON.parse(JSON.stringify(policyData));

export function getPolicy() {
  return currentPolicy;
}

export function updatePolicy(newPolicy: any) {
  currentPolicy = newPolicy;
}

export function isVendorApproved(vendorIdOrName: string): boolean {
  if (!vendorIdOrName) return false;
  const normalized = vendorIdOrName.toLowerCase().trim();
  return seedData.vendors.some(
    (v) =>
      (v.id.toLowerCase() === normalized || v.name.toLowerCase() === normalized) &&
      v.status === 'APPROVED'
  );
}

/**
 * Determine the tier and required approvals for a given action
 */
export function getRequiredApproval(action: ActionRequest): PolicyTierEvaluation {
  const tiers = currentPolicy.tiers;

  switch (action.type) {
    case 'READ_LEDGER':
      return {
        tier: 0,
        tierName: tiers['0'].name,
        requiredApprovers: 0,
        totalApproverPool: 3,
        description: tiers['0'].description,
        allowedApproverRoles: tiers['0'].allowedRoles
      };

    case 'PAYMENT': {
      const amount = action.amount ?? 0;
      const approved = isVendorApproved(action.payee || '');

      // Tier 1: Under 50 credits AND to an already-approved vendor
      if (amount > 0 && amount < 50 && approved) {
        return {
          tier: 1,
          tierName: tiers['1'].name,
          requiredApprovers: 1,
          totalApproverPool: 3,
          description: tiers['1'].description,
          allowedApproverRoles: tiers['1'].allowedApproverRoles,
          isApprovedVendor: true
        };
      }

      // Tier 2: 50 credits or more, OR unapproved/new vendor
      return {
        tier: 2,
        tierName: tiers['2'].name,
        requiredApprovers: 2,
        totalApproverPool: 3,
        description: tiers['2'].description,
        allowedApproverRoles: tiers['2'].allowedApproverRoles,
        isApprovedVendor: approved
      };
    }

    case 'ADD_VENDOR':
    case 'EXPORT_MEMBERS':
      return {
        tier: 2,
        tierName: tiers['2'].name,
        requiredApprovers: 2,
        totalApproverPool: 3,
        description: tiers['2'].description,
        allowedApproverRoles: tiers['2'].allowedApproverRoles
      };

    case 'CHANGE_POLICY':
      return {
        tier: 3,
        tierName: tiers['3'].name,
        requiredApprovers: 3,
        totalApproverPool: 3,
        description: tiers['3'].description,
        allowedApproverRoles: tiers['3'].allowedApproverRoles
      };

    default:
      // Default to Tier 2 for safety
      return {
        tier: 2,
        tierName: 'Tier 2: Default High-Risk Quorum',
        requiredApprovers: 2,
        totalApproverPool: 3,
        description: 'Unknown action type defaults to 2-of-3 quorum',
        allowedApproverRoles: ['approver']
      };
  }
}
