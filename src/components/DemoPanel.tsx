import React, { useState } from 'react';
import { Bot, Skull, ShieldAlert, Coins, Scale } from 'lucide-react';
import { api, type Me } from '../api/client';

interface DemoPanelProps {
  me: Me | null;
  approvals: any[];
  onRefresh: () => Promise<void>;
  onShowApprovals: () => void;
}

const btn = (color: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem',
  borderRadius: '10px', border: `1px solid ${color}`, background: 'transparent',
  color: '#fff', fontWeight: 700, fontSize: '0.85rem', textAlign: 'left'
});

/**
 * Scenario buttons for the video. Every step is a real request from the signed-in Tide session;
 * the panel prints what the server actually answered.
 */
export const DemoPanel: React.FC<DemoPanelProps> = ({ me, approvals, onRefresh, onShowApprovals }) => {
  const [lines, setLines] = useState<Array<{ ok: boolean; text: string }>>([]);
  const say = (ok: boolean, text: string) => setLines((l) => [...l, { ok, text }]);

  async function run(fn: () => Promise<void>) {
    setLines([]);
    try {
      await fn();
    } catch (e: any) {
      say(false, e.message);
    }
    await onRefresh();
  }

  const scenario1 = () => run(async () => {
    const r: any = await api.runAgent('normal');
    say(true, `Agent read INV-2026-01 and proposed 30 credits → ${r.tier.tierName}. An approver now approves in the queue.`);
    onShowApprovals();
  });

  const scenario2 = () => run(async () => {
    const r: any = await api.runAgent('poisoned');
    say(false, `Hijacked agent called the bank directly: ${r.direct.message}`);
    say(false, `Hijacked agent's proposal ${r.proposal}: ${r.viaProposal.message}`);
    say(true, 'Treasury unchanged. The proposal sits in the queue, flagged as coming from an untrusted document.');
  });

  const scenario3 = () => run(async () => {
    const target = approvals.find((p) => p.status === 'PENDING' && p.action.kind === 'PAYMENT');
    if (target) {
      try {
        await api.approve(target.approvalPath);
        say(true, `Approve ${target.id} as ${me?.username}: accepted`);
      } catch (e: any) {
        say(false, `Approve ${target.id} as ${me?.username} (${me?.role}): ${e.message}`);
      }
    }
    const r: any = await api.rogueAdmin();
    for (const a of r.attempts) say(!a.blocked, `${a.attempt}: ${a.blocked ? 'REFUSED' : 'ALLOWED'} — ${a.reason}`);
  });

  const scenario3b = () => run(async () => {
    const r: any = await api.runAgent('quorum');
    say(true, `Agent proposed 80 credits to Neural Creative Assets → ${r.tier.tierName}. Two approvers must approve from their own Tide sessions.`);
    onShowApprovals();
  });

  const policyChange = () => run(async () => {
    const p: any = await api.proposePolicyChange(1000);
    say(true, `Proposed raising the Tier 1 limit to 1000 → ${p.evaluation.tierName}. Execute stays refused until three approvers sign.`);
    onShowApprovals();
  });

  return (
    <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Demo scenarios</h2>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Signed in as <b>{me?.username}</b> ({me?.role}). Use a second browser profile for another approver.
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
        <button style={btn('var(--success-green)')} onClick={scenario1}><Bot size={16} /> 1. Normal work (30 credits, Tier 1)</button>
        <button style={btn('var(--danger-red)')} onClick={scenario2}><Skull size={16} /> 2. Poisoned invoice attack</button>
        <button style={btn('var(--warning-yellow)')} onClick={scenario3}><ShieldAlert size={16} /> 3a. Rogue admin attempts</button>
        <button style={btn('var(--primary-blue)')} onClick={scenario3b}><Coins size={16} /> 3b. 80-credit payment (2-of-3)</button>
        <button style={btn('var(--tide-cyan)')} onClick={policyChange}><Scale size={16} /> Propose policy change (3-of-3)</button>
      </div>
      {lines.length > 0 && (
        <div style={{ marginTop: '1rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.ok ? 'var(--success-green)' : 'var(--danger-red)' }}>
              {l.ok ? '✓' : '✗'} {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
