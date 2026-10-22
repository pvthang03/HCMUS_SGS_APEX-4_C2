import React, { useCallback, useEffect, useState } from 'react';
import { useTideCloak, useAuthCallback, Authenticated, Unauthenticated } from '@tidecloak/react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AgentLog } from './components/AgentLog';
import { ApprovalsQueue } from './components/ApprovalsQueue';
import { DemoPanel } from './components/DemoPanel';
import { api, setSecureFetch, type Me } from './api/client';
import { LayoutDashboard, CheckSquare, Terminal, Lock } from 'lucide-react';

const center: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: '1rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem'
};

// isInitializing must be checked before the Authenticated/Unauthenticated guards.
export const App: React.FC = () => {
  const { isInitializing, initError } = useTideCloak();
  const { isCallback, isProcessing, error } = useAuthCallback({
    onSuccess: (returnUrl) => window.location.assign(returnUrl || '/'),
    onError: () => window.location.assign('/'),
    onMissingVerifierRedirectTo: '/'
  });

  if (isCallback) {
    if (error) return <div style={center}>Authentication failed: {error.message}</div>;
    return <div style={center}>{isProcessing ? 'Completing Tide login…' : 'Redirecting…'}</div>;
  }
  if (initError) return <div style={center}>TideCloak failed to initialise: {initError.message}</div>;
  if (isInitializing) return <div style={center}>Connecting to TideCloak…</div>;

  return (
    <>
      <Authenticated>
        <LiveTreasury />
      </Authenticated>
      <Unauthenticated>
        <Login />
      </Unauthenticated>
    </>
  );
};

const Login: React.FC = () => {
  const { login } = useTideCloak();
  return (
    <div style={center}>
      <div style={{
        width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #0070F3 0%, #00E5FF 100%)'
      }}>
        <Lock size={28} color="#000" />
      </div>
      <h1 style={{ color: '#fff', fontSize: '1.8rem', fontWeight: 800 }}>Leashed</h1>
      <p style={{ maxWidth: 520 }}>
        An AI treasurer that can do the work but cannot move money alone. Sign in as a council approver or the
        moderator; your Tide session is the only thing that can sign your approval.
      </p>
      <button
        onClick={login}
        style={{ padding: '0.8rem 1.6rem', borderRadius: 10, border: 'none', background: 'var(--primary-blue)', color: '#fff', fontWeight: 800 }}
      >
        Log in with Tide
      </button>
    </div>
  );
};

const LiveTreasury: React.FC = () => {
  const { secureFetch, logout } = useTideCloak();
  return <Treasury secureFetch={secureFetch} logout={logout} />;
};

export interface SimControls {
  users: string[];
  current: string;
  onSwitch: (username: string) => void;
}

export const Treasury: React.FC<{
  secureFetch: (url: string, init?: RequestInit) => Promise<Response>;
  logout: () => void;
  sim?: SimControls;
}> = ({ secureFetch, logout, sim }) => {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<'dashboard' | 'approvals' | 'logs'>('dashboard');
  const [treasury, setTreasury] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  setSecureFetch(secureFetch);

  const refresh = useCallback(async () => {
    try {
      const [m, t, p, a, l] = await Promise.all([
        api.me(), api.getTreasuryStatus(), api.getPolicy(), api.getApprovals(), api.getAgentLogs()
      ]);
      setMe(m); setTreasury(t); setPolicy(p); setApprovals(a); setLogs(l);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const pending = approvals.filter((a) => a.status === 'PENDING').length;
  const blocked = logs.filter((l) => l.status === 'BLOCKED').length;
  const tabBtn = (id: typeof tab, label: string, Icon: typeof Lock, badge?: number) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '0.5rem 1rem', borderRadius: 8, border: 'none', fontSize: '0.85rem', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        backgroundColor: tab === id ? 'var(--primary-blue)' : 'transparent',
        color: tab === id ? '#fff' : 'var(--text-muted)'
      }}
    >
      <Icon size={16} /> {label}
      {!!badge && (
        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: 9999, backgroundColor: 'var(--danger-red)', color: '#fff' }}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header me={me} onLogout={logout} sim={sim} />
      {sim && (
        <div style={{ background: '#78350F', color: '#FEF3C7', padding: '0.5rem 2rem', fontSize: '0.8rem', textAlign: 'center' }}>
          <b>SIMULATED SIGN-IN (organisers' Plan C):</b> a local stand-in signs access tokens instead of TideCloak's ORK network.
          DPoP keys, approval proofs and the bank's verification are the real code.
        </div>
      )}
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '2rem', width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
        {error && (
          <div style={{ padding: '0.75rem 1rem', borderRadius: 10, border: '1px solid var(--danger-red)', color: 'var(--danger-red)' }}>
            API error: {error}
          </div>
        )}
        <DemoPanel me={me} approvals={approvals} onRefresh={refresh} onShowApprovals={() => setTab('approvals')} />
        <div style={{ display: 'flex', gap: '0.75rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          {tabBtn('dashboard', 'Treasury', LayoutDashboard)}
          {tabBtn('approvals', 'Approvals queue', CheckSquare, pending)}
          {tabBtn('logs', 'Audit log', Terminal, blocked)}
        </div>
        {tab === 'dashboard' && (
          <Dashboard treasury={treasury} policy={policy} onNavigateToApprovals={() => setTab('approvals')} onNavigateToLogs={() => setTab('logs')} />
        )}
        {tab === 'approvals' && <ApprovalsQueue approvals={approvals} me={me} onRefresh={refresh} />}
        {tab === 'logs' && <AgentLog logs={logs} onRefresh={refresh} />}
      </main>
      <footer style={{ borderTop: '1px solid var(--border-color)', padding: '1.25rem 2rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Leashed • UNLOCKED (RMIT x Tide, Challenge 2) • Built with{' '}
        <a href="https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked" target="_blank" rel="noreferrer" style={{ color: 'var(--tide-cyan)' }}>
          TideCloak
        </a>
      </footer>
    </div>
  );
};
