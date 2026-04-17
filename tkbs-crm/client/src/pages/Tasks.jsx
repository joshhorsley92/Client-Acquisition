import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const data = await api.getTasks();
      setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const markDone = async (id) => {
    await api.updateTask(id, { status: 'done' });
    load();
  };

  const deleteTask = async (id) => {
    await api.deleteTask(id);
    load();
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7);

  const overdue = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) < today);
  const todayTasks = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) >= today && new Date(t.due_at) < tomorrow);
  const upcoming = tasks.filter(t => t.status === 'pending' && t.due_at && new Date(t.due_at) >= tomorrow && new Date(t.due_at) < nextWeek);
  const noDue = tasks.filter(t => t.status === 'pending' && !t.due_at);

  if (loading) return <div style={{ padding: 40 }}>Loading tasks...</div>;

  const renderSection = (title, items, color) => (
    items.length > 0 && (
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          {title} ({items.length})
        </h3>
        {items.map(t => (
          <div key={t.id} style={{
            background: '#fff', border: '1px solid #E2E6EB',
            borderRadius: 6, marginBottom: 6, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <button
                  onClick={() => markDone(t.id)}
                  style={{ background: 'none', border: '2px solid #E2E6EB', borderRadius: 4, width: 20, height: 20, cursor: 'pointer', flexShrink: 0 }}
                />
                <div
                  onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                  style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                >
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontSize: 10, color: '#64748B', marginRight: 4 }}>
                      {expandedTask === t.id ? '▾' : '▸'}
                    </span>
                    {t.description}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {t.company_name || 'No company'} {t.contact_name && `· ${t.contact_name}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {t.due_at && (
                  <span style={{ fontSize: 11, color: color === '#dc2626' ? '#dc2626' : '#64748B' }}>
                    {new Date(t.due_at).toLocaleDateString()} {new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <button
                  onClick={() => navigate(`/deals/${t.deal_id}`)}
                  style={{ background: 'none', border: 'none', color: '#00D4AA', fontSize: 11, cursor: 'pointer' }}
                >
                  View Deal →
                </button>
                <button
                  onClick={() => deleteTask(t.id)}
                  title="Delete task"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#64748B', fontSize: 16, lineHeight: 1, padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            {expandedTask === t.id && (
              <div style={{ padding: '8px 12px 12px 44px', background: '#F7F8FA', borderTop: '1px solid #E2E6EB' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Time spent (min)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        key={`time-${t.id}`}
                        type="number"
                        min="0"
                        defaultValue={t.time_minutes || ''}
                        onBlur={(e) => {
                          const val = e.target.value === '' ? null : parseInt(e.target.value) || 0;
                          if (val !== (t.time_minutes || null)) {
                            api.updateTask(t.id, { time_minutes: val }).then(load);
                          }
                        }}
                        placeholder="0"
                        style={{
                          width: 80, padding: '6px 8px', border: '1px solid #E2E6EB',
                          borderRadius: 4, fontSize: 12, textAlign: 'center',
                          boxSizing: 'border-box',
                        }}
                      />
                      {t.time_minutes > 0 && (
                        <span style={{ fontSize: 11, color: '#64748B' }}>
                          = {Math.round((t.time_minutes / 60) * 10) / 10}h
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Notes</label>
                <textarea
                  key={`notes-${t.id}`}
                  defaultValue={t.notes || ''}
                  onBlur={(e) => {
                    if (e.target.value !== (t.notes || '')) {
                      api.updateTask(t.id, { notes: e.target.value }).then(load);
                    }
                  }}
                  placeholder="Add notes..."
                  style={{
                    width: '100%', minHeight: 60, padding: 8, border: '1px solid #E2E6EB',
                    borderRadius: 4, fontSize: 12, resize: 'vertical', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    )
  );

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Tasks</h1>
      {tasks.filter(t => t.status === 'pending').length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>No pending tasks. You're all caught up.</div>
      )}
      {renderSection('Overdue', overdue, '#dc2626')}
      {renderSection('Today', todayTasks, '#1B2838')}
      {renderSection('Upcoming', upcoming, '#64748B')}
      {renderSection('No Due Date', noDue, '#64748B')}
    </div>
  );
}
