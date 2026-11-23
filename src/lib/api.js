async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.status = response.status;
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
};
