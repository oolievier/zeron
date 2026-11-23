const SESSION_KEY = 'zeron:session';

export function getSession() {
  return localStorage.getItem(SESSION_KEY) || '';
}

export function setSession(token) {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

function authHeaders(extra = {}) {
  const session = getSession();
  return session ? { 'X-Zeron-Session': session, ...extra } : extra;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  library: () => request('/api/questions'),
  submitQuestion: (payload) => request('/api/questions', { method: 'POST', body: JSON.stringify(payload) }),
  getRoom: (code, playerId) => request(`/api/room?code=${encodeURIComponent(code)}&playerId=${encodeURIComponent(playerId)}`),
  roomAction: (payload) => request('/api/room', { method: 'POST', body: JSON.stringify(payload) }),
  account: {
    me: () => request('/api/account?action=me'),
    register: (payload) => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'register', ...payload }) }),
    verify: (token) => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'verify', token }) }),
    resend: (email) => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'resend', email }) }),
    login: (email, password) => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'login', email, password }) }),
    logout: () => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'logout' }) }).finally(() => setSession('')),
    saveRun: (payload) => request('/api/account', { method: 'POST', body: JSON.stringify({ action: 'saveRun', ...payload }) }),
  },
};
