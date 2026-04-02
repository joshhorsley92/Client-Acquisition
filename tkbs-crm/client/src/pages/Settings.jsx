import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

export default function Settings() {
  const [actions, setActions] = useState([]);
  const [users, setUsers] = useState([]);
  const [cliStatus, setCliStatus] = useState(null);
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'member' });
  const [activeTab, setActiveTab] = useState('actions');

  useEffect(() => {
    api.request('/settings/actions').then(d => setActions(d.actions)).catch(() => {});
    api.request('/settings/users').then(d => setUsers(d.users)).catch(() => {});
    api.request('/settings/cli-status').then(d => setCliStatus(d.available)).catch(() => setCliStatus(false));
  }, []);

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
