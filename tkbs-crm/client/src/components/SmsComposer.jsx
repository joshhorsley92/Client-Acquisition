import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

export default function SmsComposer({ deal, contact, onSent }) {
  const [to, setTo] = useState(contact?.phone || '');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [twilioConnected, setTwilioConnected] = useState(false);

  useEffect(() => {
    api.request('/integrations/twilio').then(d => {
      setTwilioConnected(d.integration?.enabled);
    }).catch(() => {});
  }, []);

  useEffect(() => { setTo(contact?.phone || ''); }, [contact]);

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await api.request('/sms/send', { method: 'POST', body: { deal_id: deal.id, contact_id: contact?.id, to, body } });
      setSuccess('SMS sent!');
      setBody('');
      if (onSent) onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (!twilioConnected) {
    return (
      <div style={{ padding: 12, background: '#FFF3E0', border: '1px solid #E6A817', borderRadius: 8, fontSize: 13, color: '#E6A817' }}>
        Twilio not connected. Go to Settings → Integrations to configure.
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1B2838' }}>Send SMS</div>
      {error && <div style={{ background: '#FFF3E0', color: '#E6A817', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {success && <div style={{ background: '#E6FAF5', color: '#00D4AA', padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{success}</div>}
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>To</label>
        <input value={to} onChange={(e) => setTo(e.target.value)} required placeholder="+1234567890"
          style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 2 }}>Message</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} maxLength={1600}
          style={{ width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ fontSize: 11, color: '#64748B', textAlign: 'right' }}>{body.length}/1600</div>
      </div>
      <button type="submit" disabled={sending} style={{
        padding: '8px 20px', background: '#00D4AA', color: '#1B2838', border: 'none',
        borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
        opacity: sending ? 0.6 : 1,
      }}>
        {sending ? 'Sending...' : 'Send SMS'}
      </button>
    </form>
  );
}
