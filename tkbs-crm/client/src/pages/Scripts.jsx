import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Modal from '../components/Modal';

const STAGES = ['prospect', 'lead', 'outreach', 'discovery_call', 'proposal', 'follow_up', 'closed_won'];
const TYPES = ['email', 'call_script', 'objection', 'checklist', 'follow_up'];

export default function Scripts() {
  const [scripts, setScripts] = useState([]);
  const [activeStage, setActiveStage] = useState('outreach');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ stage: 'outreach', name: '', type: 'email', content: '' });
  const [editing, setEditing] = useState(null);

  // Deal context for merge-field preview
  const [deals, setDeals] = useState([]);
  const [selectedDealId, setSelectedDealId] = useState('');
  const [dealContext, setDealContext] = useState({ deal: null, company: null, contact: null });

  const load = async () => {
    const data = await api.getScripts({ stage: activeStage });
    setScripts(data.scripts);
  };

  useEffect(() => { load(); }, [activeStage]);

  useEffect(() => {
    api.getDeals().then((d) => setDeals(d.deals || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedDealId) {
      setDealContext({ deal: null, company: null, contact: null });
      return;
    }
    api.getDeal(selectedDealId).then((d) => {
      setDealContext({ deal: d.deal, company: d.company, contact: d.contact });
    }).catch(() => setDealContext({ deal: null, company: null, contact: null }));
  }, [selectedDealId]);

  const fillMergeFields = (content) => {
    if (!dealContext.deal) return content;
    const { deal, company, contact } = dealContext;
    const ctx = {
      company: company?.name || '', contact: contact?.name || '',
      email: contact?.email || '', phone: contact?.phone || '',
      industry: company?.industry || '', location: company?.location || '',
      type: company?.type || '', website: company?.website || '',
      source: deal?.source || '', source_detail: deal?.source_detail || '',
      package_type: deal?.package_type || '',
      estimated_value: deal?.estimated_value ? `$${Number(deal.estimated_value).toLocaleString()}` : '',
      call_notes: deal?.call_notes || '', pricing_notes: deal?.pricing_notes || '',
      services_discussed: deal?.services_discussed || '', services: deal?.services_discussed || '',
      research_findings: deal?.research_findings || '', objections_noted: deal?.objections_noted || '',
      stage: deal?.stage?.replace(/_/g, ' ') || '',
      company_name: company?.name || '', contact_name: contact?.name || '', contact_email: contact?.email || '',
    };
    return content.replace(/\{(\w+)\}/g, (match, field) => ctx[field] || match);
  };

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

      {/* Deal context picker for merge-field preview */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, padding: '10px 16px',
        background: '#F7F8FA', borderRadius: 6, border: '1px solid #E2E6EB',
      }}>
        <label style={{ fontSize: 12, color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Preview with deal:
        </label>
        <select
          value={selectedDealId}
          onChange={(e) => setSelectedDealId(e.target.value)}
          style={{
            flex: 1, maxWidth: 400, padding: '6px 10px', border: '1px solid #E2E6EB',
            borderRadius: 4, fontSize: 13, background: '#fff', color: '#1B2838',
          }}
        >
          <option value="">None (show raw merge fields)</option>
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.company_name || `Deal #${d.id}`} — {d.stage?.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        {dealContext.deal && (
          <span style={{ fontSize: 11, color: '#00D4AA', fontWeight: 600 }}>
            ✓ {dealContext.company?.name || 'Loaded'}
          </span>
        )}
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
            background: dealContext.deal ? '#fff' : '#F7F8FA',
            border: dealContext.deal ? '1px solid #E6FAF5' : 'none',
            padding: 12, borderRadius: 4, fontSize: 12,
            whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', color: '#64748B',
          }}>
            {(() => {
              const filled = fillMergeFields(s.content);
              return filled.slice(0, 300) + (filled.length > 300 ? '...' : '');
            })()}
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
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14 }}>
                {TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
              Content <span style={{ fontSize: 11 }}>(merge fields: {'{company}'}, {'{contact}'}, {'{industry}'}, {'{location}'}, etc.)</span>
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
