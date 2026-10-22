import React, { useState } from 'react';
import { CheckCircle2, XCircle, Play, AlertTriangle, FileWarning } from 'lucide-react';
import { api, type Me } from '../api/client';

interface ApprovalsQueueProps {
  approvals: any[];
  me: Me | null;
  onRefresh: () => Promise<void>;
}

const card: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '12px',
  padding: '1.25rem'
};

const button = (bg: string, disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '0.4rem',
  padding: '0.5rem 0.9rem', borderRadius: '8px', border: 'none',
  backgroundColor: bg, color: '#fff', fontWeight: 700, fontSize: '0.8rem',
  opacity: disabled ? 0.5 : 1
});

function describe(p: any): string {
  const a = p.action;
  return a.kind === 'PAYMENT'
    ? `Pay ${a.amount} credits to ${a.payee} (${a.invoiceId})`
    : `Policy change: ${a.summary}`;
}

export const ApprovalsQueue: React.FC<ApprovalsQueueProps> = ({ approvals, me, onRefresh }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { ok: boolean; text: string }>>({});

  async function act(id: string, fn: () => Promise<unknown>, okText: string) {
    setBusy(id);
    try {
      await fn();
      setFeedback((f) => ({ ...f, [id]: { ok: true, text: okText } }));
    } catch (e: any) {
      setFeedback((f) => ({ ...f, [id]: { ok: false, text: e.message } }));
    } finally {
      setBusy(null);
      await onRefresh();
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={card}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>Approvals queue</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Pressing <b>Approve</b> sends a request whose URL contains the SHA-256 of this exact action. Your Tide
          session signs it with a DPoP key that only your browser holds and that TideCloak bound into your
          VVK-signed token. That pair is the approval. The bank recounts these approvals itself before any payment.
        </p>
      </div>

      {approvals.length === 0 && <div style={card}>No proposals yet. Run a scenario from the demo panel.</div>}

      {approvals.map((p) => {
        const pending = p.status === 'PENDING';
        const mine = p.approvals.some((a: any) => a.sub === me?.sub);
        const met = p.approvals.length >= p.evaluation.requiredApprovers;
        const untrusted = p.proposer?.source && p.proposer.source !== 'invoice inbox';
        const fb = feedback[p.id];
        return (
          <div key={p.id} style={{ ...card, borderColor: untrusted ? 'rgba(239,68,68,0.5)' : 'var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{describe(p)}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  {p.evaluation.tierName} • proposed by {p.proposer.username}
                  {p.proposer.source ? ` from ${p.proposer.source}` : ''} • {p.id}
                </div>
                {untrusted && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--danger-red)', fontSize: '0.8rem', marginTop: '0.35rem' }}>
                    <FileWarning size={14} /> Drafted from an untrusted document. Read it before approving.
                  </div>
                )}
                <code style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  action sha256 {p.digest.slice(0, 24)}…
                </code>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: met ? 'var(--success-green)' : 'var(--warning-yellow)' }}>
                  {p.approvals.length} of {p.evaluation.requiredApprovers}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.status}</div>
              </div>
            </div>

            {p.approvals.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                {p.approvals.map((a: any) => (
                  <span key={a.sub} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(16,185,129,0.15)', color: 'var(--success-green)' }}>
                    ✓ {a.username}
                  </span>
                ))}
              </div>
            )}

            {pending && (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                <button
                  disabled={busy === p.id || mine}
                  style={button('var(--success-green)', busy === p.id || mine)}
                  onClick={() => act(p.id, () => api.approve(p.approvalPath), 'Approval recorded (Tide-signed).')}
                >
                  <CheckCircle2 size={14} /> {mine ? 'You approved' : 'Approve'}
                </button>
                <button
                  disabled={busy === p.id}
                  style={button('var(--danger-red)', busy === p.id)}
                  onClick={() => act(p.id, () => api.reject(p.id, 'Rejected by council member'), 'Rejected.')}
                >
                  <XCircle size={14} /> Reject
                </button>
                <button
                  disabled={busy === p.id}
                  style={button('var(--primary-blue)', busy === p.id)}
                  onClick={() => act(p.id, () => api.execute(p.id), p.action.kind === 'PAYMENT' ? 'Bank settled the payment.' : 'Policy updated.')}
                >
                  <Play size={14} /> Execute{met ? '' : ' (will be refused)'}
                </button>
              </div>
            )}

            {fb && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.8rem',
                color: fb.ok ? 'var(--success-green)' : 'var(--danger-red)'
              }}>
                {fb.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {fb.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
