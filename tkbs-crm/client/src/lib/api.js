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

function qs(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
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

  // Clients (v2)
  getClients: (params) => request(`/clients${qs(params)}`),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (body) => request('/clients', { method: 'POST', body }),
  updateClient: (id, body) => request(`/clients/${id}`, { method: 'PATCH', body }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  getClientActivities: (id) => request(`/clients/${id}/activities`),
  recomputeClientFitScore: (id) => request(`/clients/${id}/fit-score/recompute`, { method: 'POST' }),

  // Engagements (v2)
  getEngagements: (params) => request(`/engagements${qs(params)}`),
  getEngagement: (id) => request(`/engagements/${id}`),
  createEngagement: (body) => request('/engagements', { method: 'POST', body }),
  updateEngagement: (id, body) => request(`/engagements/${id}`, { method: 'PATCH', body }),
  deleteEngagement: (id) => request(`/engagements/${id}`, { method: 'DELETE' }),
  getEngagementGenerationStatus: (id) => request(`/engagements/${id}/generation-status`),
  generateForEngagement: (id, body) => request(`/engagements/${id}/generate`, { method: 'POST', body }),

  // Enrichment (v2)
  runEnrichment: (body) => request('/enrichment/run', { method: 'POST', body }),
  getEnrichment: (clientId) => request(`/enrichment/${clientId}`),

  // Activities — now scoped by client_id and/or engagement_id
  getActivities: (params) => request(`/activities${qs(params)}`),
  createActivity: (body) => request('/activities', { method: 'POST', body }),

  // Automation templates (backend table still named script_templates).
  getScripts: (params) => request(`/scripts${qs(params)}`),
  createScript: (body) => request('/scripts', { method: 'POST', body }),
  updateScript: (id, body) => request(`/scripts/${id}`, { method: 'PATCH', body }),
  deleteScript: (id) => request(`/scripts/${id}`, { method: 'DELETE' }),

  // Automations — runnable AI generation workflows (proposal, etc.)
  getAutomationCatalog: () => request('/automations/catalog'),
  runAutomation: (body) => request('/automations/run', { method: 'POST', body }),
  getAutomationJob: (id) => request(`/automations/job/${id}`),

  // Reports (v2 — drops /funnel /velocity /time-investment; adds /status /client-revenue)
  getReportSummary: () => request('/reports/summary'),
  getReportStatus: () => request('/reports/status'),
  getReportSources: () => request('/reports/sources'),
  getReportLostReasons: () => request('/reports/lost-reasons'),
  getReportMonthly: () => request('/reports/monthly'),
  getReportClientRevenue: () => request('/reports/client-revenue'),

  // Audit log (admin only)
  getAuditLog: (params) => request(`/settings/audit-log${qs(params)}`),

  // Call recordings — scoped by client_id and/or engagement_id
  getCalls: (params) => request(`/calls${qs(params)}`),
  getCall: (id) => request(`/calls/${id}`),
  updateCall: (id, body) => request(`/calls/${id}`, { method: 'PATCH', body }),
  deleteCall: (id) => request(`/calls/${id}`, { method: 'DELETE' }),
  extractBrandProfile: (id) => request(`/calls/${id}/extract-brand-profile`, { method: 'POST' }),
  // Multipart create — FormData, not JSON.
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

  // Generic request helper for settings/integrations pages
  request: (path, options = {}) => request(path, options),
};
