import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

// Phase 3A: full CRUD works against the new pruned template set. The
// deal-context merge-field preview is removed here — 3B will replace it
// with a client-context preview inside ClientDetail → Scripts tab.

const STAGES = ['working', 'proposal', 'closed_won'];
const TYPES = ['email', 'call_script', 'objection', 'checklist', 'follow_up'];

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [activeStage, setActiveStage] = useState('working');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ stage: 'working', name: '', type: 'email', content: '' });
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const data = await api.getScripts({ stage: activeStage });
    setScripts(data.scripts);
  };

  useEffect(() => { load(); }, [activeStage]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) {
      await api.updateScript(editing, form);
    } else {
      await api.createScript(form);
    }
    setShowForm(false);
    setForm({ stage: activeStage, name: '', type: 'email', content: '' });
    setEditing(null);
    load();
  };

  const startEdit = (s) => {
    setForm({ stage: s.stage, name: s.name, type: s.type, content: s.content });
    setEditing(s.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this script template?')) return;
    await api.deleteScript(id);
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Script Templates</h1>
        <button
          onClick={() => { setEditing(null); setForm({ stage: activeStage, name: '', type: 'email', content: '' }); setShowForm(true); }}
          style={{
            background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
            padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          + New Template
        </button>
      </div>

      <div style={{
        marginBottom: 16, padding: '10px 14px',
        background: '#F7F8FA', borderRadius: 6, border: '1px solid #E2E6EB',
        fontSize: 12, color: '#64748B',
      }}>
        In-context merge-field preview against a real client comes back in Phase 3B under ClientDetail → Scripts.
      </div>

      {/* Stage tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {STAGES.map(s => (
          <button key={s} onClick={() => setActiveStage(s)} style={{
            padding: '6px 14px', fontSize: 12, borderRadius: 4, border: '1px solid #E2E6EB',
            background: activeStage === s ? '#1B2838' : '#fff',
            color: activeStage === s ? '#fff' : '#64748B',
            cursor: 'pointer', fontWeight: activeStage === s ? 600 : 400,
          }}>
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Script list */}
      {scripts.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>
          No templates for this stage yet.
        </div>
      )}
      {scripts.map(s => (
        <div key={s.id} style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
          padding: 16, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</span>
              <span style={{
                fontSize: 11, color: '#64748B', background: '#F7F8FA',
                padding: '2px 8px', borderRadius: 3, marginLeft: 8,
              }}>
                {s.type}
              </span>
            </div>
            <div>
              <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', color: '#00D4AA', cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Edit</button>
              <button onClick={() => handleDelete(s.id)} style={{ background: 'none', border: 'none', color: '#E6A817', cursor: 'pointer', fontSize: 12 }}>Delete</button>
            </div>
          </div>
          <pre style={{
            background: '#F7F8FA', padding: 12, borderRadius: 4, fontSize: 12,
            whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', color: '#64748B',
          }}>
            {s.content.slice(0, 300) + (s.content.length > 300 ? '...' : '')}
          </pre>
        </div>
      ))}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Template' : 'New Template'}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }} />
            </div>
            <div style={{ width: 160 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Stage</label>
              <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div style={{ width: 160 }}>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
              Content <span style={{ fontSize: 11 }}>(merge fields: {'{client_name}'}, {'{industry}'}, {'{location}'}, etc.)</span>
            </label>
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required
              rows={12}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontFamily: 'monospace', resize: 'vertical' }} />
          </div>
          <button type="submit" style={{
            width: '100%', padding: '10px 0', background: '#00D4AA', color: '#1B2838',
            border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>
            {editing ? 'Save Changes' : 'Create Template'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
