import React from 'react';
import { DollarSign, ShieldAlert, CheckCircle, Clock, Building, Users, FileText, ArrowRight } from 'lucide-react';

interface DashboardProps {
  treasury: {
    balance: number;
    currency: string;
    transactions: any[];
    vendors: any[];
  } | null;
  policy: any;
  onNavigateToApprovals: () => void;
  onNavigateToLogs: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  treasury,
  policy,
  onNavigateToApprovals,
  onNavigateToLogs
}) => {
  const balance = treasury?.balance ?? 1000;
  const transactions = treasury?.transactions ?? [];
  const vendors = treasury?.vendors ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Top Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '1.25rem'
      }}>
        {/* Treasury Balance */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'var(--primary-glow)',
            filter: 'blur(30px)'
          }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              GUILD TREASURY
            </span>
            <span style={{
              fontSize: '0.75rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--success-green)',
              fontWeight: 700
            }}>
              SOLVENT
            </span>
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
              {balance.toLocaleString()}
            </span>
            <span style={{ fontSize: '1rem', color: 'var(--tide-cyan)', fontWeight: 700 }}>
              CREDITS
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Enforced by TideCloak Mock Bank Enclave • Zero unilateral override
          </p>
        </div>

        {/* Settled Transactions */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              SETTLED PAYMENTS
            </span>
            <CheckCircle size={18} color="var(--success-green)" />
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#fff' }}>
              {transactions.length}
            </span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Every settlement verified with VVK cryptographic signatures
          </p>
        </div>

        {/* Emergent Authority Invariant */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          borderRadius: '12px',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(19, 27, 42, 0.9) 0%, rgba(0, 112, 243, 0.1) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--tide-cyan)', fontWeight: 700 }}>
              EMERGENT AUTHORITY
            </span>
            <span style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              backgroundColor: 'rgba(0, 229, 255, 0.15)',
              color: 'var(--tide-cyan)',
              fontWeight: 700
            }}>
              FORSETI POLICY
            </span>
          </div>
          <div style={{ marginTop: '0.75rem' }}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              No Master Key Exists
            </h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Authority is assembled only when the right identity, policy, and human council quorum line up.
            </p>
          </div>
        </div>
      </div>

      {/* Policy Action Tiers (Module B) */}
      <div style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '1.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Action Governance Tiers (Forseti Policy)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Cryptographic gates enforced by TideCloak before any action signature can be minted
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem'
        }}>
          {/* Tier 0 */}
          <div style={{
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tide-cyan)' }}>TIER 0</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>0 Approvals</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '0.35rem' }}>
              Autonomous Agent
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Read ledger, ingest invoices, draft proposals. Zero spending authority.
            </p>
          </div>

          {/* Tier 1 */}
          <div style={{
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--success-green)' }}>TIER 1</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--success-green)', fontWeight: 600 }}>1 Approver</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '0.35rem' }}>
              Routine Payments &lt; 50
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Minor payments under 50 credits to already-approved guild vendors.
            </p>
          </div>

          {/* Tier 2 */}
          <div style={{
            backgroundColor: 'var(--bg-main)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning-yellow)' }}>TIER 2</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--warning-yellow)', fontWeight: 600 }}>2-of-3 Quorum</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '0.35rem' }}>
              Major Action Quorum
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Payments &ge; 50 credits, new vendor onboarding, member data exports.
            </p>
          </div>

          {/* Tier 3 */}
          <div style={{
            backgroundColor: 'var(--bg-main)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            padding: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--danger-red)' }}>TIER 3</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--danger-red)', fontWeight: 600 }}>3-of-3 Quorum</span>
            </div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginTop: '0.35rem' }}>
              Constitutional Rules
            </h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
              Modifying thresholds or approver roster. Admin cannot weaken rules alone.
            </p>
          </div>
        </div>
      </div>

      {/* Two Column Section: Approved Vendors & Recent Ledger */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Approved Vendors Directory */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Building size={16} color="var(--primary-blue)" />
            Approved Guild Vendors
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {vendors.map((v) => (
              <div key={v.id} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{v.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{v.category} • ID: {v.id}</div>
                </div>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--success-green)'
                }}>
                  APPROVED
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Settled Ledger Transactions */}
        <div style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '1.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={16} color="var(--tide-cyan)" />
            Settled Ledger Transactions
          </h3>
          {transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No transactions settled yet. Run Scenario 1 from the Demo panel to execute a quorum payment.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
              {transactions.map((tx: any) => (
                <div key={tx.id} style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                      {tx.payee}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--danger-red)' }}>
                      -{tx.amount} Credits
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>TX: {tx.id.substring(0, 15)}...</span>
                    <span>Signers: {tx.approvers?.join(', ') || 'N/A'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
