export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'approver' | 'member' | 'agent';
  description: string;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  jkt: string;
}

let currentSession: AuthSession | null = null;
const sessionListeners: Array<(session: AuthSession | null) => void> = [];

export function subscribeSession(listener: (session: AuthSession | null) => void) {
  sessionListeners.push(listener);
  return () => {
    const idx = sessionListeners.indexOf(listener);
    if (idx !== -1) sessionListeners.splice(idx, 1);
  };
}

function notifySession() {
  for (const listener of sessionListeners) {
    listener(currentSession);
  }
}

export async function loginAs(username: string): Promise<AuthSession> {
  const res = await fetch('/api/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to login');
  }

  currentSession = await res.json();
  localStorage.setItem('leashed_user', username);
  notifySession();
  return currentSession!;
}

export function getCurrentSession(): AuthSession | null {
  return currentSession;
}

export function logout() {
  currentSession = null;
  localStorage.removeItem('leashed_user');
  notifySession();
}

/**
 * Authenticated API Request with Sender-Constrained RFC 9449 DPoP
 */
export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  if (!currentSession) {
    throw new Error('Not authenticated. Please select a user session.');
  }

  const method = (options.method || 'GET').toUpperCase();
  const url = endpoint.startsWith('http') ? endpoint : `${window.location.origin}${endpoint}`;

  // Request RFC 9449 DPoP proof from helper
  const proofRes = await fetch('/api/auth/dpop-proof', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: currentSession.user.username,
      method,
      url,
      accessToken: currentSession.accessToken
    })
  });

  if (!proofRes.ok) {
    throw new Error('Failed to generate DPoP proof');
  }

  const { proof } = await proofRes.json();

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `DPoP ${currentSession.accessToken}`);
  headers.set('DPoP', proof);
  if (options.body && typeof options.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error || `HTTP ${response.status}`);
  }

  return data as T;
}

// Client API helpers
export const api = {
  getUsers: async (): Promise<User[]> => {
    const res = await fetch('/api/auth/users');
    return res.json();
  },

  getTreasuryStatus: () => apiRequest('/api/treasury/status'),
  getPolicy: () => apiRequest('/api/policy'),
  getApprovals: (status?: string) => apiRequest(`/api/approvals${status ? `?status=${status}` : ''}`),
  approveRequest: (id: string) => apiRequest(`/api/approvals/${id}/approve`, { method: 'POST' }),
  rejectRequest: (id: string, reason: string) =>
    apiRequest(`/api/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),
  executePayment: (actionId: string, amount: number, payee: string, authorizationProof: string) =>
    apiRequest('/api/treasury/execute', {
      method: 'POST',
      body: JSON.stringify({ actionId, amount, payee, authorizationProof })
    }),
  getAgentLogs: () => apiRequest('/api/agent/logs'),

  // Demo Scenarios
  runScenario1: () => apiRequest('/api/agent/run-scenario-1', { method: 'POST' }),
  runScenario2: () => apiRequest('/api/agent/run-scenario-2', { method: 'POST' }),
  runScenario3: () => apiRequest('/api/agent/run-scenario-3', { method: 'POST' }),

  // Rogue Admin Attacks
  attemptAdminBypass: () => apiRequest('/api/treasury/admin-bypass-attempt', { method: 'POST' }),
  attemptPolicyOverride: () => apiRequest('/api/policy/admin-override-attempt', { method: 'POST' })
};
