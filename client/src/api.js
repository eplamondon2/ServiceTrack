// Utilitaire API — toutes les requêtes passent par ici
const BASE = '/api';

function getToken() { return localStorage.getItem('st_token'); }

async function req(method, path, body, isFile = false) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFile) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: isFile ? body : body ? JSON.stringify(body) : undefined
  });

  if (res.status === 401) {
    localStorage.removeItem('st_token');
    window.location.href = '/login';
    throw new Error('Session expirée');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  // Auth
  login:          (email, password)     => req('POST', '/auth/login', { email, password }),
  me:             ()                    => req('GET',  '/auth/me'),
  changePassword: (ancien, nouveau)     => req('POST', '/auth/change-password', { ancien, nouveau }),

  // Bons de travail
  getWorkOrders:  (params = {})         => req('GET',  '/workorders?' + new URLSearchParams(params)),
  getWorkOrder:   (id)                  => req('GET',  `/workorders/${id}`),
  createWorkOrder:(data)                => req('POST', '/workorders', data),
  updateWorkOrder:(id, data)            => req('PATCH', `/workorders/${id}`, data),
  deleteWorkOrder:(id)                  => req('DELETE', `/workorders/${id}`),
  getStats:       ()                    => req('GET',  '/workorders/stats'),

  // Suivis
  addSuivi:       (data)                => req('POST', '/suivis', data),
  getSuivis:      (work_order_id)       => req('GET',  `/suivis?work_order_id=${work_order_id}`),

  // Import
  importPdf:      (formData)            => req('POST', '/import/pdf', formData, true),

  // Users
  getUsers:       ()                    => req('GET',  '/users'),
  createUser:     (data)                => req('POST', '/users', data),
};
