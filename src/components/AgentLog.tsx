import React, { useState } from 'react';
import { Bot, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, ChevronRight, Lock } from 'lucide-react';

interface AgentLogProps {
  logs: any[];
  onRefresh: () => void;
}

export const AgentLog: React.FC<AgentLogProps> = ({ logs, onRefresh }) => {
  const [filter, setFilter] = useState<'ALL' | 'BLOCKED' | 'ALLOWED'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    if (filter === 'BLOCKED') return log.status === 'BLOCKED';
    if (filter === 'ALLOWED') return log.status === 'ALLOWED' || log.status === 'PROPOSAL_SUBMITTED';
    return true;
  });

  return (
    <div style={{
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.75rem'
    }}>
      {/* Header and Controls */}
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
            background: 'rgba(0, 229, 255, 0.15)',
            color: 'var(--tide-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bot size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
              Quartermaster AI Activity & Audit Log
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Live verification trail: every agent read, proposal, and blocked injection attempt
            </p>
          </div>
        </div>

        {/* Filter Buttons & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setFilter('ALL')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: filter === 'ALL' ? 'var(--primary-blue)' : 'var(--bg-main)',
              color: filter === 'ALL' ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border-color)'
            }}
          >
            All Logs ({logs.length})
          </button>
          <button
            onClick={() => setFilter('BLOCKED')}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: filter === 'BLOCKED' ? 'var(--danger-red)' : 'var(--bg-main)',
              color: filter === 'BLOCKED' ? '#fff' : 'var(--danger-red)',
              border: '1px solid rgba(239, 68, 68, 0.4)'
            }}
          >
            Blocked Attacks ({logs.filter((l) => l.status === 'BLOCKED').length})
          </button>
          <button
            onClick={onRefresh}
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              backgroundColor: 'var(--bg-main)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center'
            }}
            title="Refresh Logs"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Log Feed */}
      {filteredLogs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          backgroundColor: 'var(--bg-main)',
          borderRadius: '8px',
          border: '1px dashed var(--border-color)'
        }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            No agent activities matching this filter. Run Scenario 1 or Scenario 2 from the Demo panel to populate events.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredLogs.map((log) => {
            const isBlocked = log.status === 'BLOCKED';
            const isProposal = log.status === 'PROPOSAL_SUBMITTED';
            const isFailed = log.status === 'COMPROMISED';
            const isExpanded = expandedId === log.id;

            return (
              <div
                key={log.id}
                style={{
                  backgroundColor: isBlocked ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-main)',
                  border: `1px solid ${
                    isBlocked
                      ? 'rgba(239, 68, 68, 0.4)'
                      : isProposal
                      ? 'rgba(0, 112, 243, 0.3)'
                      : 'var(--border-color)'
                  }`,
                  borderRadius: '8px',
                  padding: '1rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div style={{ marginTop: '0.15rem' }}>
                      {isBlocked ? (
                        <ShieldAlert size={18} color="var(--danger-red)" />
                      ) : isProposal ? (
                        <Lock size={18} color="var(--primary-blue)" />
                      ) : isFailed ? (
                        <AlertTriangle size={18} color="var(--warning-yellow)" />
                      ) : (
                        <CheckCircle2 size={18} color="var(--success-green)" />
                      )}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)'
                        }}>
                          {log.tool}
                        </span>

                        {/* Status Badge */}
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          textTransform: 'uppercase',
                          backgroundColor: isBlocked
                            ? 'rgba(239, 68, 68, 0.2)'
                            : isProposal
                            ? 'rgba(0, 112, 243, 0.2)'
                            : isFailed
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(16, 185, 129, 0.2)',
                          color: isBlocked
                            ? 'var(--danger-red)'
                            : isProposal
                            ? '#60A5FA'
                            : isFailed
                            ? 'var(--warning-yellow)'
                            : 'var(--success-green)'
                        }}>
                          {isBlocked ? '🛡️ REFUSED' : log.status}
                        </span>

                        {log.tier !== undefined && (
                          <span style={{
                            fontSize: '0.7rem',
                            color: 'var(--text-muted)'
                          }}>
                            Tier {log.tier}
                          </span>
                        )}
                      </div>

                      <div style={{
                        fontSize: '0.85rem',
                        fontWeight: isBlocked ? 700 : 500,
                        color: isBlocked ? '#fff' : 'var(--text-main)',
                        marginTop: '0.35rem'
                      }}>
                        {log.actionSummary}
                        {log.enforcedBy && (
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Enforced by: {log.enforcedBy}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '0.2rem'
                      }}
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.75rem',
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: '#D1D5DB',
                    overflowX: 'auto'
                  }}>
                    <pre>{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
