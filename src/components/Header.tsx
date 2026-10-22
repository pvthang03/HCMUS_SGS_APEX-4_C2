import React from 'react';
import { Shield, Key, UserCheck, Bot, User, CheckCircle2, Lock } from 'lucide-react';
import type { User as UserType } from '../api/client';

interface HeaderProps {
  users: UserType[];
  currentUser: UserType | null;
  onSelectUser: (username: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ users, currentUser, onSelectUser }) => {
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
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        {/* Logo and Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0070F3 0%, #00E5FF 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px var(--primary-glow)'
          }}>
            <Lock size={22} color="#000" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
                LEASHED
              </h1>
              <span style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                background: 'rgba(0, 229, 255, 0.15)',
                color: 'var(--tide-cyan)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                fontWeight: 700
              }}>
                TideCloak Enclave
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              AI Guild Treasurer • No Master Key • Emergent Quorum Authority
            </p>
          </div>
        </div>

        {/* Security Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.75rem',
            borderRadius: '6px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            fontSize: '0.75rem',
            color: 'var(--success-green)'
          }}>
            <CheckCircle2 size={14} />
            <span>RFC 9449 DPoP + VVK Threshold Cryptography</span>
          </div>

          {/* User Persona Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Persona:</span>
            <select
              value={currentUser?.username || ''}
              onChange={(e) => onSelectUser(e.target.value)}
              style={{
                background: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.name} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>

            {/* Role Badge */}
            {currentUser && (
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                textTransform: 'uppercase',
                background:
                  currentUser.role === 'approver'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : currentUser.role === 'admin'
                    ? 'rgba(168, 85, 247, 0.2)'
                    : currentUser.role === 'agent'
                    ? 'rgba(0, 229, 255, 0.2)'
                    : 'rgba(59, 130, 246, 0.2)',
                color:
                  currentUser.role === 'approver'
                    ? 'var(--success-green)'
                    : currentUser.role === 'admin'
                    ? '#C084FC'
                    : currentUser.role === 'agent'
                    ? 'var(--tide-cyan)'
                    : '#60A5FA',
                border: `1px solid ${
                  currentUser.role === 'approver'
                    ? 'rgba(16, 185, 129, 0.4)'
                    : currentUser.role === 'admin'
                    ? 'rgba(168, 85, 247, 0.4)'
                    : currentUser.role === 'agent'
                    ? 'rgba(0, 229, 255, 0.4)'
                    : 'rgba(59, 130, 246, 0.4)'
                }`
              }}>
                {currentUser.role}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
