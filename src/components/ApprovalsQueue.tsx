import React, { useState } from 'react';
import { Check, X, Shield, Lock, Users, AlertCircle, RefreshCw, Send, CheckCircle2 } from 'lucide-react';
import type { User } from '../api/client';

interface ApprovalsQueueProps {
  approvals: any[];
  currentUser: User | null;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onExecute: (actionId: string, amount: number, payee: string, proof: string) => Promise<void>;
  onRefresh: () => void;
}

export const ApprovalsQueue: React.FC<ApprovalsQueueProps> = ({
  approvals,
  currentUser,
  onApprove,
  onReject,
  onExecute,
  onRefresh
}) => {
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    setFeedbackMessage(null);
    try {
      await onApprove(id);
      setFeedbackMessage('Approval successfully signed and recorded with Tide.');
    } catch (err: any) {
      setFeedbackMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (record: any) => {
    setActionLoading(record.id);
    setFeedbackMessage(null);
    try {
      await onExecute(
        record.id,
        record.action.amount,
        record.action.payee,
        record.authorizationProof
      );
      setFeedbackMessage(`Payment of ${record.action.amount} credits to '${record.action.payee}' settled by Mock Bank!`);
    } catch (err: any) {
      setFeedbackMessage(`Bank Refusal: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectModalId) return;
    setActionLoading(rejectModalId);
    try {
      await onReject(rejectModalId, rejectReason || 'Rejected by council approver');
      setRejectModalId(null);
      setRejectReason('');
    } catch (err: any) {
      setFeedbackMessage(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.75rem'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--success-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Governance Approvals Queue (Quorum Gate)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Proposals pending human council signatures. No action executes without the required threshold.
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          style={{
            padding: '0.4rem 0.8rem',
            borderRadius: '6px',
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.75rem',
            fontWeight: 600
          }}
        >
          <RefreshCw size={14} />
          Refresh Queue
        </button>
      </div>

      {feedbackMessage && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          backgroundColor: feedbackMessage.startsWith('Error') || feedbackMessage.startsWith('Bank Refusal')
            ? 'rgba(239, 68, 68, 0.15)'
            : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${
            feedbackMessage.startsWith('Error') || feedbackMessage.startsWith('Bank Refusal')
              ? 'rgba(239, 68, 68, 0.4)'
              : 'rgba(16, 185, 129, 0.4)'
          }`,
          color: feedbackMessage.startsWith('Error') || feedbackMessage.startsWith('Bank Refusal')
            ? 'var(--danger-red)'
            : 'var(--success-green)',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {feedbackMessage}
        </div>
      )}

      {/* Approvals List */}
      {approvals.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          backgroundColor: 'var(--bg-main)',
          borderRadius: '8px',
          border: '1px dashed var(--border-color)'
        }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No pending approval requests. Use the Demo Panel below to trigger proposals.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {approvals.map((req) => {
            const isApproved = req.status === 'APPROVED';
            const isExecuted = req.status === 'EXECUTED';
            const isRejected = req.status === 'REJECTED';
            const isPending = req.status === 'PENDING';

            const userAlreadyApproved = req.approvals?.some(
              (a: any) => a.approverUsername === currentUser?.username
            );
            const isProposer = req.proposerUsername === currentUser?.username;
            const canSign = currentUser?.role === 'approver' && !userAlreadyApproved && !isProposer && isPending;

            const progressPct = Math.min(100, Math.round((req.currentApprovals / req.requiredApprovals) * 100));

            return (
              <div
                key={req.id}
                style={{
                  backgroundColor: 'var(--bg-main)',
                  border: `1px solid ${
                    isExecuted
                      ? 'rgba(16, 185, 129, 0.3)'
                      : isApproved
                      ? 'rgba(0, 229, 255, 0.4)'
                      : 'var(--border-color)'
                  }`,
                  borderRadius: '10px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-main)'
                    }}>
                      {req.id}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor:
                        req.evaluation.tier === 1
                          ? 'rgba(16, 185, 129, 0.15)'
                          : req.evaluation.tier === 2
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(239, 68, 68, 0.15)',
                      color:
                        req.evaluation.tier === 1
                          ? 'var(--success-green)'
                          : req.evaluation.tier === 2
                          ? 'var(--warning-yellow)'
                          : 'var(--danger-red)'
                    }}>
                      Tier {req.evaluation.tier}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Proposed by: <strong style={{ color: '#fff' }}>{req.proposerUsername}</strong>
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px',
                    textTransform: 'uppercase',
                    backgroundColor: isExecuted
                      ? 'rgba(16, 185, 129, 0.2)'
                      : isApproved
                      ? 'rgba(0, 229, 255, 0.2)'
                      : isRejected
                      ? 'rgba(239, 68, 68, 0.2)'
                      : 'rgba(245, 158, 11, 0.2)',
                    color: isExecuted
                      ? 'var(--success-green)'
                      : isApproved
                      ? 'var(--tide-cyan)'
                      : isRejected
                      ? 'var(--danger-red)'
                      : 'var(--warning-yellow)'
                  }}>
                    {isExecuted ? '✓ SETTLED AT BANK' : isApproved ? '⭐ QUORUM REACHED' : req.status}
                  </span>
                </div>

                {/* Details Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
                      {req.action.type}: {req.action.amount ? `${req.action.amount} Credits` : ''} to {req.action.payee || 'Guild'}
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                      {req.evaluation.description}
                    </p>
                  </div>

                  {/* Quorum Progress Bar */}
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Council Signatures:</span>
                      <strong style={{ color: isApproved || isExecuted ? 'var(--tide-cyan)' : 'var(--text-main)' }}>
                        {req.currentApprovals} of {req.requiredApprovals}
                      </strong>
                    </div>
                    <div style={{
                      height: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '9999px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        backgroundColor: isExecuted || isApproved ? 'var(--tide-cyan)' : 'var(--warning-yellow)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  </div>
                </div>

                {/* Approvers List */}
                <div style={{
                  padding: '0.6rem 0.8rem',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  fontSize: '0.75rem',
                  flexWrap: 'wrap'
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Signers:</span>
                  {req.approvals && req.approvals.length > 0 ? (
                    req.approvals.map((a: any) => (
                      <span key={a.approverUsername} style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        color: 'var(--success-green)',
                        fontWeight: 600
                      }}>
                        ✓ {a.approverUsername}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Awaiting signatures
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {isPending && (
                    <>
                      <button
                        onClick={() => setRejectModalId(req.id)}
                        disabled={actionLoading === req.id || currentUser?.role !== 'approver'}
                        style={{
                          padding: '0.45rem 0.9rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--danger-red)',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          opacity: currentUser?.role !== 'approver' ? 0.5 : 1
                        }}
                      >
                        Reject
                      </button>

                      <button
                        onClick={() => handleApprove(req.id)}
                        disabled={!canSign || actionLoading === req.id}
                        style={{
                          padding: '0.45rem 1.1rem',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: canSign ? 'var(--success-green)' : 'rgba(255, 255, 255, 0.08)',
                          color: canSign ? '#000' : 'var(--text-muted)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          opacity: canSign ? 1 : 0.6
                        }}
                      >
                        <Check size={16} />
                        {userAlreadyApproved
                          ? 'Signed by You'
                          : currentUser?.role !== 'approver'
                          ? `Sign (${currentUser?.role} restricted)`
                          : 'Sign Approval (Tide Key)'}
                      </button>
                    </>
                  )}

                  {/* Quorum Reached -> Ready for Mock Bank Execution */}
                  {isApproved && !isExecuted && (
                    <button
                      onClick={() => handleExecute(req)}
                      disabled={actionLoading === req.id}
                      style={{
                        padding: '0.5rem 1.25rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #0070F3 0%, #00E5FF 100%)',
                        color: '#000',
                        fontSize: '0.85rem',
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        boxShadow: '0 0 15px var(--primary-glow)'
                      }}
                    >
                      <Send size={16} />
                      Execute Payout at Mock Bank (Submit VVK Proof)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '1.5rem',
            width: '90%',
            maxWidth: '450px'
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '0.75rem' }}>
              Reject Proposal
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Provide a reason for rejecting this action:
            </p>
            <input
              type="text"
              placeholder="e.g. Unverified invoice amount"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: '#fff',
                marginBottom: '1rem'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setRejectModalId(null)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  backgroundColor: 'var(--danger-red)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 600
                }}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
