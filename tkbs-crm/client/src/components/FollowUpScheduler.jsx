import React, { useState } from 'react';
import { api } from '../lib/api';

export default function FollowUpScheduler({ dealId, onCreated }) {
  const [mode, setMode] = useState('natural'); // 'natural' or 'picker'
  const [natural, setNatural] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [description, setDescription] = useState('Follow up');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const body = { deal_id: dealId, description };
      if (mode === 'natural') {
        body.due_at_natural = natural;
      } else {
        body.due_at = `${date}T${time}:00`;
      }
      await api.createTask(body);
      setNatural('');
      setDate('');
      setDescription('Follow up');
      if (onCreated) onCreated();
    } catch (err) {
      alert('Failed to schedule: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#F7F8FA', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#1B2838' }}>
        Schedule Follow-Up
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setMode('natural')}
          style={{
            padding: '4px 12px', fontSize: 12, borderRadius: 4,
            border: '1px solid #E2E6EB', cursor: 'pointer',
            background: mode === 'natural' ? '#1B2838' : '#fff',
            color: mode === 'natural' ? '#fff' : '#64748B',
          }}
        >
          Natural Language
        </button>
        <button
          onClick={() => setMode('picker')}
          style={{
            padding: '4px 12px', fontSize: 12, borderRadius: 4,
            border: '1px solid #E2E6EB', cursor: 'pointer',
            background: mode === 'picker' ? '#1B2838' : '#fff',
            color: mode === 'picker' ? '#fff' : '#64748B',
          }}
        >
          Date Picker
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8 }}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What to do..."
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }}
          />
        </div>

        {mode === 'natural' ? (
          <input
            value={natural}
            onChange={(e) => setNatural(e.target.value)}
            placeholder='e.g., "3 days at 8AM" or "next Tuesday at 2PM"'
            required
            style={{ width: '100%', padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, marginBottom: 8 }}
          />
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              style={{ flex: 1, padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={{ width: 120, padding: '6px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13 }} />
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '6px 16px', fontSize: 12, background: '#00D4AA', color: '#1B2838',
          border: 'none', borderRadius: 4, fontWeight: 600, cursor: 'pointer',
        }}>
          {loading ? 'Scheduling...' : 'Schedule'}
        </button>
      </form>
    </div>
  );
}
