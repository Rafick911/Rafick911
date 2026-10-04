/** PINPONG TIPS — Client API. */

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: method === 'GET' ? undefined : jsonHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Erreur ${res.status}`);
    err.status = res.status;
    err.code = data && data.code;
    err.data = data;
    throw err;
  }
  return raw ? data : data;
}

const qs = (params = {}) => {
  const usable = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false);
  return usable.length ? `?${new URLSearchParams(usable).toString()}` : '';
};

export const api = {
  // Auth
  me: () => request('/auth/me'),
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (current_password, new_password) =>
    request('/auth/password', { method: 'POST', body: { current_password, new_password } }),
  users: () => request('/auth/users'),

  // Public
  championships: (all = false) => request(`/championships${all ? '?all=1' : ''}`),
  matches: (params) => request(`/matches${qs(params)}`),
  match: (id) => request(`/matches/${id}`),
  predictions: (params) => request(`/predictions${qs(params)}`),
  history: (params) => request(`/history${qs(params)}`),
  players: (q) => request(`/players${qs({ q })}`),
  stats: (all = false) => request(`/stats${all ? '?all=1' : ''}`),
  summary: () => request('/stats/summary'),
  notifications: (limit = 30) => request(`/notifications${qs({ limit })}`),
  settings: () => request('/settings'),

  // Admin
  dashboard: () => request('/admin/dashboard'),
  createMatch: (payload) => request('/admin/matches', { method: 'POST', body: payload }),
  updateMatch: (id, payload) => request(`/admin/matches/${id}`, { method: 'PUT', body: payload }),
  setMatchStatus: (id, status) => request(`/admin/matches/${id}/status`, { method: 'PATCH', body: { status } }),
  deleteMatch: (id) => request(`/admin/matches/${id}`, { method: 'DELETE' }),
  recordResult: (id, payload) => request(`/admin/matches/${id}/result`, { method: 'POST', body: payload }),
  matchRevisions: (id) => request(`/admin/matches/${id}/revisions`),
  savePrediction: (matchId, payload) => request(`/admin/matches/${matchId}/prediction`, { method: 'POST', body: payload }),
  deletePrediction: (matchId) => request(`/admin/matches/${matchId}/prediction`, { method: 'DELETE' }),
  publishPrediction: (matchId, published) =>
    request(`/admin/matches/${matchId}/prediction/publish`, { method: 'PATCH', body: { published } }),
  setPredictionStatus: (matchId, status, note) =>
    request(`/admin/matches/${matchId}/prediction/status`, { method: 'PATCH', body: { status, note } }),
  bulkMatches: (matches) => request('/admin/matches/bulk', { method: 'POST', body: { matches } }),
  createChampionship: (payload) => request('/admin/championships', { method: 'POST', body: payload }),
  updateChampionship: (id, payload) => request(`/admin/championships/${id}`, { method: 'PUT', body: payload }),
  toggleChampionship: (id) => request(`/admin/championships/${id}/toggle`, { method: 'PATCH' }),
  deleteChampionship: (id, force = false) => request(`/admin/championships/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }),
  journal: (params) => request(`/admin/journal${qs(params)}`),
  revisions: (entity_type, entity_id) => request(`/admin/revisions${qs({ entity_type, entity_id })}`),
  adminSettings: () => request('/admin/settings'),
  saveSettings: (payload) => request('/admin/settings', { method: 'PUT', body: payload }),
  pushNotification: (payload) => request('/admin/notifications', { method: 'POST', body: payload }),
  deleteNotification: (id) => request(`/admin/notifications/${id}`, { method: 'DELETE' }),
  createUser: (payload) => request('/admin/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/admin/users/${id}`, { method: 'PATCH', body: payload }),
  recalculate: () => request('/admin/recalculate', { method: 'POST' }),
};

export default api;
