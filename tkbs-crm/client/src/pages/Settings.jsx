import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const INTEGRATION_META = {
  gmail: {
    label: 'Gmail',
    description: 'Send and receive emails from deal views. Auto-log as activity with open/click tracking.',
    fields: null, // OAuth flow (placeholder)
    oauthPlaceholder: true,
  },
  slack: {
    label: 'Slack',
    description: 'Post notifications to Slack on stage changes, closed deals, and overdue tasks.',
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...' },
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'xoxb-...' },
    ],
  },
  google_calendar: {
    label: 'Google Calendar',
    description: 'Auto-create calendar events for discovery calls. Shares Gmail OAuth.',
    fields: null,
    oauthPlaceholder: true,
  },
  twilio: {
    label: 'Twilio SMS',
    description: 'Send and receive SMS messages from deal views. Auto-log as activity.',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Your auth token' },
      { key: 'phoneNumber', label: 'Phone Number', type: 'text', placeholder: '+15551234567' },
    ],
  },
  webhooks: {
    label: 'Webhooks',
    description: 'Fire outbound webhooks on CRM events. Compatible with Zapier, Make, and n8n.',
    fields: null,
    webhooksPlaceholder: true,
  },
};

function IntegrationCard({ integration, onToggle, onSave, onDisconnectGoogle }) {
  const meta = INTEGRATION_META[integration.type];
  if (!meta) return null;

  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(integration.config || '{}'); } catch { return {}; }
  });
  const [saving, setSaving] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const isConnected = integration.enabled === 1;
  const googleEmail = config.email || null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(integration.type, config);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnectingGoogle(true);
    try {
      const data = await api.request('/integrations/google/auth');
      window.location.href = data.url;
    } catch (err) {
      alert('Failed to start Google OAuth: ' + err.message);
      setConnectingGoogle(false);
    }
  };

  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
      marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{ padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{meta.label}</span>
            <span style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
              background: isConnected ? '#E6FAF5' : '#F7F8FA',
              color: isConnected ? '#00D4AA' : '#94A3B8',
              border: `1px solid ${isConnected ? '#00D4AA' : '#E2E6EB'}`,
            }}>
              {isConnected ? 'Connected' : 'Not connected'}
            </span>
            {isConnected && googleEmail && meta.oauthPlaceholder && (
              <span style={{ fontSize: 12, color: '#64748B' }}>{googleEmail}</span>
            )}
          </div>
          <p style={{ fontSize: 12, color: '#64748B', margin: '4px 0 0' }}>{meta.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 16 }}>
          {!meta.oauthPlaceholder && (
            <button
              onClick={() => onToggle(integration.type, integration.enabled)}
              style={{
                padding: '5px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                background: isConnected ? '#00D4AA' : '#E2E6EB',
                color: isConnected ? '#1B2838' : '#64748B',
                border: 'none', fontWeight: 600,
              }}
            >
              {isConnected ? 'Enabled' : 'Disabled'}
            </button>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              padding: '5px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
              background: 'none', border: '1px solid #E2E6EB', color: '#1B2838', fontWeight: 600,
            }}
          >
            {expanded ? 'Close' : 'Configure'}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid #F1F5F9' }}>
          <div style={{ paddingTop: 14 }}>
            {meta.oauthPlaceholder && (
              <div>
                {isConnected && googleEmail ? (
                  <div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: '#E6FAF5', border: '1px solid #00D4AA', borderRadius: 6, marginBottom: 12,
                    }}>
                      <span style={{ fontSize: 13, color: '#00D4AA', fontWeight: 600 }}>Connected as {googleEmail}</span>
                    </div>
                    <button
                      onClick={onDisconnectGoogle}
                      style={{
                        padding: '8px 16px', background: '#FFF3E0', color: '#E6A817',
                        border: '1px solid #E6A817', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Disconnect Google Account
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={handleConnectGoogle}
                      disabled={connectingGoogle}
                      style={{
                        padding: '8px 16px', background: '#1B2838', color: '#fff',
                        border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                        cursor: connectingGoogle ? 'not-allowed' : 'pointer',
                        opacity: connectingGoogle ? 0.7 : 1,
                      }}
                    >
                      {connectingGoogle ? 'Redirecting...' : 'Connect Google Account'}
                    </button>
                    <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>
                      Connects Gmail and Google Calendar with one OAuth flow.
                    </p>
                  </div>
                )}
              </div>
            )}

            {meta.webhooksPlaceholder && (
              <div>
                <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 8px' }}>
                  Configure outbound webhooks to fire on deal stage changes and other CRM events.
                </p>
                <button style={{
                  padding: '8px 16px', background: '#E2E6EB', color: '#1B2838',
                  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'not-allowed',
                  opacity: 0.7,
                }}>
                  Manage Webhooks (coming soon)
                </button>
              </div>
            )}

            {meta.fields && meta.fields.map(field => (
              <div key={field.key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#64748B', display: 'block', marginBottom: 4 }}>
                  {field.label}
                </label>
                <input
                  type={field.type}
                  value={config[field.key] || ''}
                  placeholder={field.placeholder}
                  onChange={(e) => setConfig(c => ({ ...c, [field.key]: e.target.value }))}
                  style={{
                    width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                    borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            {meta.fields && (
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 20px', background: '#00D4AA', color: '#1B2838',
                  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Saving...' : 'Save Config'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const location = useLocation();
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [cliStatus, setCliStatus] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' });
  const [activeTab, setActiveTab] = useState('actions');
  const [oauthBanner, setOauthBanner] = useState(null);

  useEffect(() => {
    api.request('/settings/actions').then(d => setActions(d.actions)).catch(() => {});
    api.request('/settings/users').then(d => setUsers(d.users)).catch(() => {});
    api.request('/settings/cli-status').then(d => setCliStatus(d.available)).catch(() => setCliStatus(false));
    api.request('/integrations').then(d => setIntegrations(d.integrations)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'google') {
      setOauthBanner({ type: 'success', message: 'Google account connected successfully!' });
      setActiveTab('integrations');
      // Refresh integrations
      api.request('/integrations').then(d => setIntegrations(d.integrations)).catch(() => {});
    } else if (params.get('error') === 'google_auth_failed') {
      setOauthBanner({ type: 'error', message: 'Google OAuth failed. Please try again.' });
      setActiveTab('integrations');
    }
  }, [location.search]);

  const toggleIntegration = async (type, currentEnabled) => {
    await api.request(`/integrations/${type}`, { method: 'PATCH', body: { enabled: !currentEnabled } });
    const d = await api.request('/integrations');
    setIntegrations(d.integrations);
  };

  const saveIntegrationConfig = async (type, config) => {
    await api.request(`/integrations/${type}`, { method: 'PATCH', body: { config } });
    const d = await api.request('/integrations');
    setIntegrations(d.integrations);
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect your Google account? This will disable Gmail and Google Calendar.')) return;
    await api.request('/integrations/google/disconnect', { method: 'POST' });
    const d = await api.request('/integrations');
    setIntegrations(d.integrations);
  };

  const toggleAction = async (id, enabled) => {
    await api.request(`/settings/actions/${id}`, { method: 'PATCH', body: { enabled: !enabled } });
    const d = await api.request('/settings/actions');
    setActions(d.actions);
  };

  const createUser = async (e) => {
    e.preventDefault();
    await api.request('/settings/users', { method: 'POST', body: newUser });
    setShowNewUser(false);
    setNewUser({ name: '', email: '', password: '', role: 'member' });
    const d = await api.request('/settings/users');
    setUsers(d.users);
  };

  const deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    await api.request(`/settings/users/${id}`, { method: 'DELETE' });
    const d = await api.request('/settings/users');
    setUsers(d.users);
  };

  const tabStyle = (t) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#00D4AA' : '#64748B', background: 'none', border: 'none',
    borderBottom: activeTab === t ? '2px solid #00D4AA' : '2px solid transparent', cursor: 'pointer',
  });

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Settings</h1>

      {/* CLI Status */}
      <div style={{
        padding: '10px 16px', borderRadius: 6, marginBottom: 20, fontSize: 13,
        background: cliStatus ? '#E6FAF5' : '#FFF3E0',
        color: cliStatus ? '#00D4AA' : '#E6A817',
        border: `1px solid ${cliStatus ? '#00D4AA' : '#E6A817'}`,
      }}>
        Claude Code CLI: {cliStatus === null ? 'Checking...' : cliStatus ? 'Installed and available' : 'Not installed — AI features disabled'}
      </div>

      <div style={{ borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        <button onClick={() => setActiveTab('actions')} style={tabStyle('actions')}>Stage Actions</button>
        <button onClick={() => setActiveTab('users')} style={tabStyle('users')}>Team</button>
        <button onClick={() => setActiveTab('integrations')} style={tabStyle('integrations')}>Integrations</button>
      </div>

      {activeTab === 'actions' && (
        <div>
          {actions.map(a => (
            <div key={a.id} style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{a.stage.replace('_', ' ')}</span>
                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{a.action_type}</span>
              </div>
              <button
                onClick={() => toggleAction(a.id, a.enabled)}
                style={{
                  padding: '4px 12px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                  background: a.enabled ? '#00D4AA' : '#E2E6EB',
                  color: a.enabled ? '#1B2838' : '#64748B',
                  border: 'none', fontWeight: 600,
                }}
              >
                {a.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'integrations' && (
        <div>
          <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
            Connect external services to automate your sales workflow. All integrations are independently toggleable.
          </p>
          {oauthBanner && (
            <div style={{
              padding: '10px 16px', borderRadius: 6, marginBottom: 16, fontSize: 13,
              background: oauthBanner.type === 'success' ? '#E6FAF5' : '#FFF3E0',
              color: oauthBanner.type === 'success' ? '#00D4AA' : '#E6A817',
              border: `1px solid ${oauthBanner.type === 'success' ? '#00D4AA' : '#E6A817'}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{oauthBanner.message}</span>
              <button onClick={() => setOauthBanner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit' }}>×</button>
            </div>
          )}
          {integrations.length === 0 && (
            <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Loading integrations...
            </div>
          )}
          {integrations.map(integration => (
            <IntegrationCard
              key={integration.type}
              integration={integration}
              onToggle={toggleIntegration}
              onSave={saveIntegrationConfig}
              onDisconnectGoogle={disconnectGoogle}
            />
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <button
            onClick={() => setShowNewUser(true)}
            style={{
              background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
              padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginBottom: 16,
            }}
          >
            + Add Team Member
          </button>

          {users.map(u => (
            <div key={u.id} style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 14, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</span>
                <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{u.email}</span>
                <span style={{
                  fontSize: 11, marginLeft: 8, padding: '2px 8px', borderRadius: 3,
                  background: u.role === 'admin' ? '#00D4AA' : '#F7F8FA',
                  color: u.role === 'admin' ? '#1B2838' : '#64748B',
                }}>{u.role}</span>
              </div>
              <button onClick={() => deleteUser(u.id)} style={{
                background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12,
              }}>Remove</button>
            </div>
          ))}

          <Modal open={showNewUser} onClose={() => setShowNewUser(false)} title="Add Team Member">
            <form onSubmit={createUser}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
                <input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Email</label>
                <input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Password</label>
                <input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Role</label>
                <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button type="submit" style={{
                width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Create User</button>
            </form>
          </Modal>
        </div>
      )}
    </div>
  );
}
