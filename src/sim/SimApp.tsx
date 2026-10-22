import React, { useEffect, useState } from 'react';
import { Lock, UserCheck, Shield } from 'lucide-react';
import { Treasury } from '../App';
import { simLogin, type SimSession } from './simAuth';

const PEOPLE: Record<string, { role: string; blurb: string }> = {
  ari: { role: 'approver', blurb: 'Council approver' },
  bob: { role: 'approver', blurb: 'Council approver' },
  cleo: { role: 'approver', blurb: 'Council approver' },
  admin: { role: 'moderator', blurb: 'Moderator (admin) — no approval power' }
};

// Plan C shell: the same Treasury UI, signed in through the simulated TideCloak issuer.
export const SimApp: React.FC = () => {
  const [users, setUsers] = useState<string[]>([]);
  const [session, setSession] = useState<SimSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (username: string) => {
    setBusy(username);
    try {
      setSession(await simLogin(username));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    fetch('/api/sim/users').then((r) => r.json()).then(setUsers);
    const as = new URLSearchParams(window.location.search).get('as');
    if (as) signIn(as);
  }, []);

  if (session) {
    return (
      <Treasury
        key={session.token}
        secureFetch={session.secureFetch}
        logout={() => setSession(null)}
        sim={{ users, current: session.username, onSwitch: signIn }}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', padding: '2rem', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0070F3 0%, #00E5FF 100%)' }}>
        <Lock size={28} color="#000" />
      </div>
      <h1 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 800 }}>Leashed</h1>
      <p style={{ maxWidth: 560, color: 'var(--text-muted)' }}>
        An AI treasurer that can do the work but cannot move money alone. Sign in as a council approver or the moderator.
      </p>
      <div style={{ maxWidth: 560, fontSize: '0.8rem', color: '#FEF3C7', background: '#78350F', padding: '0.6rem 0.9rem', borderRadius: 10 }}>
        <b>Simulated TideCloak sign-in (organisers' Plan C).</b> In the live build this is the Tide enclave login; roles and
        access checks below are enforced by the same server code either way.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', width: '100%', maxWidth: 860 }}>
        {users.map((u) => {
          const p = PEOPLE[u] || { role: 'member', blurb: '' };
          const Icon = p.role === 'approver' ? UserCheck : Shield;
          return (
            <button
              key={u}
              onClick={() => signIn(u)}
              disabled={!!busy}
              style={{
                padding: '1rem', borderRadius: 12, border: '1px solid var(--border-color)', background: 'var(--bg-card)',
                color: '#fff', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.35rem'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800 }}>
                <Icon size={16} color={p.role === 'approver' ? 'var(--success-green)' : 'var(--warning-yellow)'} />
                {busy === u ? 'Signing in…' : `Sign in with Tide as ${u}`}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>role: {p.role} · {p.blurb}</span>
            </button>
          );
        })}
      </div>
      {error && <p style={{ color: 'var(--danger-red)' }}>{error}</p>}
    </div>
  );
};
