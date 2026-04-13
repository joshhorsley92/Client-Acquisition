const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed: ${res.status}`);
  }

  return data;
}

export const api = {
  // Auth
  login: (body) => request('/auth/login', { method: 'POST', body }),
  verifyTotp: (body) => request('/auth/verify-totp', { method: 'POST', body }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  setupTotp: () => request('/auth/setup-totp', { method: 'POST' }),
  enableTotp: (body) => request('/auth/enable-totp', { method: 'POST', body }),
  disableTotp: (body) => request('/auth/disable-totp', { method: 'POST', body }),

  // Companies
  getCompanies: () => request('/companies'),
  getCompany: (id) => request(`/companies/${id}`),
  createCompany: (body) => request('/companies', { method: 'POST', body }),
  updateCompany: (id, body) => request(`/companies/${id}`, { method: 'PATCH', body }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),

  // Contacts
  getContacts: (params) => request(`/contacts${params ? '?' + new URLSearchParams(params) : ''}`),
  getContact: (id) => request(`/contacts/${id}`),
  createContact: (body) => request('/contacts', { method: 'POST', body }),
  updateContact: (id, body) => request(`/contacts/${id}`, { method: 'PATCH', body }),
  deleteContact: (id) => request(`/contacts/${id}`, { method: 'DELETE' }),

  // Deals
  getDeals: (params) => request(`/deals${params ? '?' + new URLSearchParams(params) : ''}`),
  getDeal: (id) => request(`/deals/${id}`),
  createDeal: (body) => request('/deals', { method: 'POST', body }),
  updateDeal: (id, body) => request(`/deals/${id}`, { method: 'PATCH', body }),
  deleteDeal: (id) => request(`/deals/${id}`, { method: 'DELETE' }),

  // Activities
  getActivities: (params) => request(`/activities${params ? '?' + new URLSearchParams(params) : ''}`),
  createActivity: (body) => request('/activities', { method: 'POST', body }),

  // Tasks
  getTasks: (params) => request(`/tasks${params ? '?' + new URLSearchParams(params) : ''}`),
  createTask: (body) => request('/tasks', { method: 'POST', body }),
  updateTask: (id, body) => request(`/tasks/${id}`, { method: 'PATCH', body }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),

  // Scripts
  getScripts: (params) => request(`/scripts${params ? '?' + new URLSearchParams(params) : ''}`),
  createScript: (body) => request('/scripts', { method: 'POST', body }),
  updateScript: (id, body) => request(`/scripts/${id}`, { method: 'PATCH', body }),
  deleteScript: (id) => request(`/scripts/${id}`, { method: 'DELETE' }),

  // Reports
  getReportSummary: () => request('/reports/summary'),
  getReportFunnel: () => request('/reports/funnel'),
  getReportSources: () => request('/reports/sources'),
  getReportLostReasons: () => request('/reports/lost-reasons'),
  getReportMonthly: () => request('/reports/monthly'),

  // Audit log (admin only)
  getAuditLog: (params) => request(`/settings/audit-log${params ? '?' + new URLSearchParams(params) : ''}`),

  // Call recordings — Initiative 1 capture layer
  getCalls: (params) => request(`/calls${params ? '?' + new URLSearchParams(params) : ''}`),
  getCall: (id) => request(`/calls/${id}`),
  updateCall: (id, body) => request(`/calls/${id}`, { method: 'PATCH', body }),
  deleteCall: (id) => request(`/calls/${id}`, { method: 'DELETE' }),
  extractBrandProfile: (id) => request(`/calls/${id}/extract-brand-profile`, { method: 'POST' }),
  // Create accepts FormData (multipart) since it may include an audio file.
  // Can't use the normal request() helper which assumes JSON.
  createCall: async (formData) => {
    const res = await fetch(`/api/calls`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
  },

  // Generic request helper for settings
  request: (path, options = {}) => request(path, options),
};
