import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function EmailComposer({ deal, contact, company, stage, onSent }) {
  const [to, setTo] = useState(contact?.email || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  useEffect(() => {
    api.request('/integrations/gmail').then(d => {
      setGmailConnected(d.integration?.enabled);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setTo(contact?.email || '');
  }, [contact]);

  useEffect(() => {
    if (stage) {
      api.getScripts({ stage }).then(data => {
        const emailTemplates = (data.scripts || []).filter(
          s => s.type === 'email' || s.type === 'follow_up'
        );
        setTemplates(emailTemplates);
      }).catch(() => {});
    }
  }, [stage]);

  const fillMergeFields = (content) => {
    const context = {
      company: company?.name || '', contact: contact?.name || '',
      email: contact?.email || '', phone: contact?.phone || '',
      industry: company?.industry || '', location: company?.location || '',
      type: company?.type || '', website: company?.website || '',
      source: deal?.source || '', source_detail: deal?.source_detail || '',
      referrer: deal?.source_detail || '', package_type: deal?.package_type || '',
      estimated_value: deal?.estimated_value || '',
    };
    return content.replace(/\{(\w+)\}/g, (match, field) => context[field] || match);
  };

  const handleTemplateSelect = (e) => {
    const templateId = e.target.value;
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const tpl = templates.find(t => String(t.id) === templateId);
    if (!tpl) return;

    const filled = fillMergeFields(tpl.content || '');
    const lines = filled.split('\n');
    const subjectLineIndex = lines.findIndex(l => l.trim().startsWith('Subject:'));

    if (subjectLineIndex !== -1) {
      const subjectText = lines[subjectLineIndex].replace(/^Subject:\s*/i, '').trim();
      const bodyLines = lines.filter((_, i) => i !== subjectLineIndex);
      setSubject(subjectText);
      setBody(bodyLines.join('\n').trim());
    } else {
      setSubject(tpl.name);
      setBody(filled);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await api.request('/email/send', { method: 'POST', body: { deal_id: deal.id, to, subject, body } });
      setSuccess('Email sent!');
      setSubject('');
      setBody('');
      setSelectedTemplate('');
      if (onSent) onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!gmailConnected) {
    return (
      <div style={{ padding: 16, background: '#FFF3E0', border: '1px solid #E6A817', borderRadius: 8, fontSize: 13, color: '#E6A817' }}>
        Gmail not connected. Go to Settings → Integrations to connect your Google account.
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1B2838' }}>Send Email</div>

      {error && <div style={{ background: '#FFF3E0', color: '#E6A817', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ background: '#E6FAF5', color: '#00D4AA', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{success}</div>}

      {templates.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>Load Template</label>
          <select
            value={selectedTemplate}
            onChange={handleTemplateSelect}
            style={{
              width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
              background: '#fff', color: '#1B2838', cursor: 'pointer',
            }}
          >
            <option value="">— Select a template —</option>
            {templates.map(t => (
              <option key={t.id} value={String(t.id)}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} required type="email"
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>Body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={8}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      <button type="submit" disabled={sending} style={{
        padding: '8px 20px', background: '#00D4AA', color: '#1B2838', border: 'none',
        borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
        opacity: sending ? 0.6 : 1,
      }}>
        {sending ? 'Sending...' : 'Send Email'}
      </button>
    </form>
  );
}
