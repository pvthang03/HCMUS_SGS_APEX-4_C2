export interface Me {
  sub: string;
  username: string;
  role: 'approver' | 'moderator' | 'member';
  roles: string[];
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

// The TideCloak SDK's secureFetch: attaches `Authorization: DPoP <token>` and a fresh DPoP
// proof signed by this browser's key. The app never sees or stores that key.
let secureFetch: Fetcher | null = null;

export function setSecureFetch(f: Fetcher) {
  secureFetch = f;
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (!secureFetch) throw new Error('Not signed in with Tide.');
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  // secureFetch needs an absolute URL; the proof's htu is this origin + path.
  const res = await secureFetch(`${window.location.origin}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `HTTP ${res.status}`) as Error & { status?: number; details?: unknown };
    err.status = res.status;
    err.details = data.details;
    throw err;
  }
  return data as T;
}

const post = (path: string, body?: unknown) =>
  apiRequest(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  me: () => apiRequest<Me>('/api/me'),
  getTreasuryStatus: () => apiRequest('/api/treasury/status'),
  getPolicy: () => apiRequest('/api/policy'),
  getApprovals: () => apiRequest<any[]>('/api/approvals'),
  getAgentLogs: () => apiRequest<any[]>('/api/agent/logs'),

  /** approvalPath = /api/approvals/{id}/approve/{sha256(action)}; the DPoP proof signs it. */
  approve: (approvalPath: string) => post(approvalPath),
  reject: (id: string, reason: string) => post(`/api/approvals/${id}/reject`, { reason }),
  execute: (id: string) => post(`/api/approvals/${id}/execute`),
  proposePolicyChange: (tier1MaxAmountExclusive: number) => post('/api/policy/propose', { tier1MaxAmountExclusive }),

  runAgent: (scenario: 'normal' | 'poisoned' | 'quorum') => post(`/api/agent/run/${scenario}`),
  rogueAdmin: () => post('/api/attacks/rogue-admin')
};
