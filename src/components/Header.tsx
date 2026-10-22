import React from 'react';
import { Lock, LogOut, UserCheck, Shield, User } from 'lucide-react';
import type { Me } from '../api/client';

interface HeaderProps {
  me: Me | null;
  onLogout: () => void;
  sim?: { users: string[]; current: string; onSwitch: (username: string) => void };
}

const roleStyle: Record<string, { color: string; label: string; Icon: typeof User }> = {
  approver: { color: 'var(--success-green)', label: 'Council approver', Icon: UserCheck },
  moderator: { color: 'var(--warning-yellow)', label: 'Moderator (admin)', Icon: Shield },
  member: { color: 'var(--text-muted)', label: 'Member', Icon: User }
};

export const Header: React.FC<HeaderProps> = ({ me, onLogout, sim }) => {
  const r = roleStyle[me?.role || 'member'];
  return (
    <header style={{
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'rgba(19, 27, 42, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      padding: '0.875rem 2rem'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #0070F3 0%, #00E5FF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px var(--primary-glow)'
          }}>
            <Lock size={22} color="#000" strokeWidth={2.5} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>LEASHED</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              AI guild treasurer • approvals are signed by each approver’s own session
            </p>
          </div>
        </div>

        {me && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <r.Icon size={18} color={r.color} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: '#fff' }}>{me.username}</div>
              <div style={{ fontSize: '0.75rem', color: r.color }}>{r.label}</div>
            </div>
            {sim && (
              <select
                aria-label="Simulated sign-in"
                value={sim.current}
                onChange={(e) => sim.onSwitch(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: 8, background: 'var(--bg-card)', color: '#fff', border: '1px solid var(--border-color)' }}
              >
                {sim.users.map((u) => <option key={u} value={u}>Sign in as {u}</option>)}
              </select>
            )}
            <button
              onClick={onLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.8rem',
                borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent',
                color: 'var(--text-muted)', fontWeight: 600
              }}
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
