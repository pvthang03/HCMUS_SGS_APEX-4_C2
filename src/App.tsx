import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { AgentLog } from './components/AgentLog';
import { ApprovalsQueue } from './components/ApprovalsQueue';
import { DemoPanel } from './components/DemoPanel';
import { api, loginAs, getCurrentSession, subscribeSession, type User, type AuthSession } from './api/client';
import { LayoutDashboard, Bot, CheckSquare, ShieldCheck, Terminal } from 'lucide-react';

export const App: React.FC = () => {
  const [session, setSession] = useState<AuthSession | null>(getCurrentSession());
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'logs' | 'approvals'>('dashboard');

  const [treasury, setTreasury] = useState<any>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to session changes
  useEffect(() => {
    return subscribeSession((newSession) => {
      setSession(newSession);
    });
  }, []);

  // Initial Load: Fetch users and initialize default session (Ari - Approver)
  useEffect(() => {
    const init = async () => {
      try {
        const userList = await api.getUsers();
        setUsers(userList);

        const savedUser = localStorage.getItem('leashed_user') || 'ari';
        await loginAs(savedUser);
      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Fetch application state
  const refreshData = async () => {
    if (!session) return;
    try {
      const [tStatus, pol, apprs, lgs] = await Promise.all([
        api.getTreasuryStatus().catch(() => null),
        api.getPolicy().catch(() => null),
        api.getApprovals().catch(() => []),
        api.getAgentLogs().catch(() => [])
      ]);

      if (tStatus) setTreasury(tStatus);
      if (pol) setPolicy(pol);
      if (apprs) setApprovals(apprs);
      if (lgs) setLogs(lgs);
    } catch (err) {
      console.error('Error refreshing state:', err);
    }
  };

  useEffect(() => {
    if (session) {
      refreshData();
    }
  }, [session]);

  const handleSwitchUser = async (username: string) => {
    await loginAs(username);
    await refreshData();
  };

  const handleApprove = async (id: string) => {
    await api.approveRequest(id);
    await refreshData();
  };

  const handleReject = async (id: string, reason: string) => {
    await api.rejectRequest(id, reason);
    await refreshData();
  };

  const handleExecute = async (actionId: string, amount: number, payee: string, proof: string) => {
    await api.executePayment(actionId, amount, payee, proof);
    await refreshData();
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-main)',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: '1rem'
      }}>
        Initializing Leashed Enclave & Verifying TideCloak Adapter...
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <Header
        users={users}
        currentUser={session?.user || null}
        onSelectUser={handleSwitchUser}
      />

      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '2rem',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        flex: 1
      }}>
        {/* Interactive Demo Control Bar */}
        <DemoPanel
          onRefreshAll={refreshData}
          onSwitchUser={handleSwitchUser}
        />

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem'
        }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'dashboard' ? 'var(--primary-blue)' : 'transparent',
              color: activeTab === 'dashboard' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <LayoutDashboard size={16} />
            Treasury Dashboard
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'approvals' ? 'var(--primary-blue)' : 'transparent',
              color: activeTab === 'approvals' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              position: 'relative'
            }}
          >
            <CheckSquare size={16} />
            Approvals Queue
            {approvals.filter((a) => a.status === 'PENDING').length > 0 && (
              <span style={{
                fontSize: '0.65rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '9999px',
                backgroundColor: 'var(--danger-red)',
                color: '#fff',
                marginLeft: '0.25rem'
              }}>
                {approvals.filter((a) => a.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeTab === 'logs' ? 'var(--primary-blue)' : 'transparent',
              color: activeTab === 'logs' ? '#fff' : 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Terminal size={16} />
            Quartermaster Audit Log
            {logs.filter((l) => l.status === 'BLOCKED_BY_TIDECLOAK').length > 0 && (
              <span style={{
                fontSize: '0.65rem',
                padding: '0.1rem 0.4rem',
                borderRadius: '9999px',
                backgroundColor: 'var(--danger-red)',
                color: '#fff',
                marginLeft: '0.25rem'
              }}>
                {logs.filter((l) => l.status === 'BLOCKED_BY_TIDECLOAK').length} Blocked
              </span>
            )}
          </button>
        </div>

        {/* Tab Views */}
        {activeTab === 'dashboard' && (
          <Dashboard
            treasury={treasury}
            policy={policy}
            onNavigateToApprovals={() => setActiveTab('approvals')}
            onNavigateToLogs={() => setActiveTab('logs')}
          />
        )}

        {activeTab === 'approvals' && (
          <ApprovalsQueue
            approvals={approvals}
            currentUser={session?.user || null}
            onApprove={handleApprove}
            onReject={handleReject}
            onExecute={handleExecute}
            onRefresh={refreshData}
          />
        )}

        {activeTab === 'logs' && (
          <AgentLog
            logs={logs}
            onRefresh={refreshData}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-color)',
        padding: '1.25rem 2rem',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        backgroundColor: 'rgba(19, 27, 42, 0.5)'
      }}>
        <span>Leashed • UNLOCKED Hackathon (RMIT x Tide, Challenge 2) • Powered by </span>
        <a
          href="https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked"
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--tide-cyan)', textDecoration: 'none', fontWeight: 600 }}
        >
          TideCloak
        </a>
      </footer>
    </div>
  );
};
