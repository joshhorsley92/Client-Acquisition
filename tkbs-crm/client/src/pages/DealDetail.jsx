import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import ScriptViewer from '../components/ScriptViewer';
import FollowUpScheduler from '../components/FollowUpScheduler';
import EmailComposer from '../components/EmailComposer';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [company, setCompany] = useState(null);
  const [contact, setContact] = useState(null);
  const [activities, setActivities] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [emailThread, setEmailThread] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedTask, setExpandedTask] = useState(null);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ summary: '', date: '', time: '', attendee_email: '' });
  const [meetingStatus, setMeetingStatus] = useState(null);

  const loadDeal = async () => {
    try {
      const data = await api.getDeal(id);
      setDeal(data.deal);
      setCompany(data.company);
      setContact(data.contact);
      setTasks(data.tasks || []);
      const actData = await api.getActivities({ deal_id: id });
      setActivities(actData.activities);
    } catch (err) {
      console.error('Failed to load deal:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEmailThread = async () => {
    try {
      const data = await api.request(`/email/thread/${id}`);
      setEmailThread(data.emails || []);
    } catch (err) {
      // Gmail may not be connected — silently ignore
    }
  };

  useEffect(() => { loadDeal(); loadEmailThread(); }, [id]);

  useEffect(() => {
    if (company && contact) {
      setMeetingForm(f => ({
        ...f,
        summary: f.summary || `Discovery Call — ${company.name}`,
        attendee_email: f.attendee_email || contact.email || '',
      }));
    }
  }, [company, contact]);

  const scheduleMeeting = async (e) => {
    e.preventDefault();
    setMeetingStatus(null);
    const { summary, date, time, attendee_email } = meetingForm;
    if (!summary || !date || !time) {
      setMeetingStatus({ error: 'Summary, date, and time are required.' });
      return;
    }
    const startTime = new Date(`${date}T${time}`).toISOString();
    try {
      const res = await api.request('/calendar/events', {
        method: 'POST',
        body: { deal_id: parseInt(id), summary, start_time: startTime, attendee_email: attendee_email || undefined },
      });
      setMeetingStatus({ ok: true, link: res.event?.link });
      setShowMeetingForm(false);
      loadDeal();
    } catch (err) {
      setMeetingStatus({ error: err.message || 'Failed to create event.' });
    }
  };

  const deleteTask = async (taskId) => {
    await api.deleteTask(taskId);
    loadDeal();
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    await api.createActivity({ deal_id: parseInt(id), type: 'note', content: newNote });
    setNewNote('');
    loadDeal();
  };

  const updateField = async (field, value) => {
    await api.updateDeal(id, { [field]: value });
    loadDeal();
  };

  if (loading) return <div style={{ padding: 40 }}>Loading deal...</div>;
  if (!deal) return <div style={{ padding: 40 }}>Deal not found.</div>;

  const tabs = ['overview', 'activity', 'tasks', 'scripts', 'email'];
  const tabStyle = (t) => ({
    padding: '8px 16px', fontSize: 13, fontWeight: activeTab === t ? 600 : 400,
    color: activeTab === t ? '#00D4AA' : '#64748B', background: 'none', border: 'none',
    borderBottom: activeTab === t ? '2px solid #00D4AA' : '2px solid transparent',
    cursor: 'pointer',
  });

  return (
    <div>
      <button onClick={() => navigate('/')} style={{
        background: 'none', border: 'none', color: '#64748B', fontSize: 13,
        cursor: 'pointer', marginBottom: 16,
      }}>
        ← Back to Pipeline
      </button>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{company?.name || 'No Company'}</h1>
          <div style={{ fontSize: 14, color: '#64748B' }}>
            {contact?.name || 'No Contact'} {contact?.email && `· ${contact.email}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{
            background: '#00D4AA', color: '#1B2838', padding: '4px 12px',
            borderRadius: 12, fontSize: 12, fontWeight: 700,
          }}>
            {deal.stage.replace('_', ' ').toUpperCase()}
          </span>
          {deal.package_type && (
            <span style={{
              background: '#E2E6EB', padding: '4px 12px',
              borderRadius: 12, fontSize: 12, color: '#64748B',
            }}>
              {deal.package_type}
            </span>
          )}
          {deal.estimated_value > 0 && (
            <span style={{
              background: '#E2E6EB', padding: '4px 12px',
              borderRadius: 12, fontSize: 12, color: '#64748B',
            }}>
              ${Number(deal.estimated_value).toLocaleString()}/mo
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} style={tabStyle(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1B2838' }}>Deal Info</h3>
            <div style={{ fontSize: 13, color: '#64748B', lineHeight: 2 }}>
              <div><strong>Source:</strong> {deal.source || '—'} {deal.source_detail && `(${deal.source_detail})`}</div>
              <div><strong>Package:</strong> {deal.package_type || 'Undecided'}</div>
              <div><strong>Value:</strong> ${Number(deal.estimated_value || 0).toLocaleString()}/mo</div>
              <div><strong>Stage since:</strong> {new Date(deal.stage_entered_at).toLocaleDateString()}</div>
              <div><strong>Created:</strong> {new Date(deal.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1B2838' }}>Company</h3>
            {company ? (
              <div style={{ fontSize: 13, color: '#64748B', lineHeight: 2 }}>
                <div><strong>Name:</strong> {company.name}</div>
                <div><strong>Location:</strong> {company.location || '—'}</div>
                <div><strong>Industry:</strong> {company.industry || '—'}</div>
                <div><strong>Type:</strong> {company.type || '—'}</div>
                <div><strong>Website:</strong> {company.website || '—'}</div>
              </div>
            ) : <div style={{ fontSize: 13, color: '#64748B' }}>No company linked</div>}
          </div>
          <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, color: '#1B2838' }}>Call Notes</h3>
            <textarea
              value={deal.call_notes || ''}
              onChange={(e) => updateField('call_notes', e.target.value)}
              placeholder="Add call notes..."
              style={{
                width: '100%', minHeight: 80, padding: 10, border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          </div>
          {/* Schedule Meeting card */}
          <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showMeetingForm ? 12 : 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1B2838', margin: 0 }}>Schedule Meeting</h3>
              <button
                onClick={() => { setShowMeetingForm(!showMeetingForm); setMeetingStatus(null); }}
                style={{
                  background: showMeetingForm ? '#E2E6EB' : '#00D4AA', color: showMeetingForm ? '#64748B' : '#1B2838',
                  border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {showMeetingForm ? 'Cancel' : '+ Schedule'}
              </button>
            </div>
            {meetingStatus?.ok && (
              <div style={{ fontSize: 13, color: '#00D4AA', marginTop: 8 }}>
                Event created!{meetingStatus.link && <> <a href={meetingStatus.link} target="_blank" rel="noreferrer" style={{ color: '#00D4AA' }}>View in Google Calendar</a></>}
              </div>
            )}
            {meetingStatus?.error && (
              <div style={{ fontSize: 13, color: '#dc2626', marginTop: 8 }}>{meetingStatus.error}</div>
            )}
            {showMeetingForm && (
              <form onSubmit={scheduleMeeting} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 3 }}>Summary</label>
                  <input
                    value={meetingForm.summary}
                    onChange={(e) => setMeetingForm(f => ({ ...f, summary: e.target.value }))}
                    placeholder="Discovery Call — Company Name"
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 3 }}>Date</label>
                    <input
                      type="date"
                      value={meetingForm.date}
                      onChange={(e) => setMeetingForm(f => ({ ...f, date: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 3 }}>Time</label>
                    <input
                      type="time"
                      value={meetingForm.time}
                      onChange={(e) => setMeetingForm(f => ({ ...f, time: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 3 }}>Attendee Email</label>
                  <input
                    type="email"
                    value={meetingForm.attendee_email}
                    onChange={(e) => setMeetingForm(f => ({ ...f, attendee_email: e.target.value }))}
                    placeholder="contact@example.com"
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  type="submit"
                  style={{
                    background: '#00D4AA', color: '#1B2838', border: 'none',
                    borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', alignSelf: 'flex-start',
                  }}
                >
                  Create Event
                </button>
              </form>
            )}
          </div>

          {/* Upcoming Tasks card */}
          {(() => {
            const now = new Date();
            const pendingTasks = tasks
              .filter(t => t.status === 'pending')
              .sort((a, b) => {
                if (!a.due_at && !b.due_at) return 0;
                if (!a.due_at) return 1;
                if (!b.due_at) return -1;
                return new Date(a.due_at) - new Date(b.due_at);
              })
              .slice(0, 5);
            const taskColor = (t) => {
              if (!t.due_at) return '#64748B';
              const d = new Date(t.due_at);
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
              if (d < todayStart) return '#dc2626';
              if (d < tomorrowStart) return '#1B2838';
              return '#64748B';
            };
            return (
              <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1B2838', margin: 0 }}>Upcoming Tasks</h3>
                  <span style={{
                    background: '#E2E6EB', color: '#64748B', fontSize: 11, fontWeight: 700,
                    borderRadius: 10, padding: '1px 7px',
                  }}>
                    {tasks.filter(t => t.status === 'pending').length}
                  </span>
                </div>
                {pendingTasks.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#64748B' }}>No pending tasks.</div>
                ) : (
                  pendingTasks.map(t => (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: '1px solid #F7F8FA',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={false}
                          onChange={async () => { await api.updateTask(t.id, { status: 'done' }); loadDeal(); }}
                          style={{ cursor: 'pointer', width: 15, height: 15 }}
                        />
                        <span style={{ fontSize: 13, color: taskColor(t) }}>{t.description}</span>
                      </div>
                      {t.due_at && (
                        <span style={{ fontSize: 11, color: taskColor(t), whiteSpace: 'nowrap', marginLeft: 8 }}>
                          {new Date(t.due_at).toLocaleDateString()} {new Date(t.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div>
          <form onSubmit={addNote} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <input
              value={newNote} onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note..."
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13,
              }}
            />
            <button type="submit" style={{
              background: '#00D4AA', color: '#1B2838', border: 'none',
              borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}>
              Add Note
            </button>
          </form>

          <div>
            {activities.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No activity yet.</div>}
            {activities.map((a) => (
              <div key={a.id} style={{
                padding: '10px 0', borderBottom: '1px solid #F7F8FA',
                display: 'flex', gap: 12, alignItems: 'flex-start',
              }}>
                <span style={{
                  fontSize: 11, color: '#fff', background: '#1B2838',
                  borderRadius: 4, padding: '2px 6px', minWidth: 50, textAlign: 'center',
                }}>
                  {a.type}
                </span>
                <div>
                  <div style={{ fontSize: 13 }}>{a.content || '—'}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <div>
          {tasks.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No tasks yet.</div>}
          {tasks.map((t) => (
            <div key={t.id} style={{
              background: '#fff', border: '1px solid #E2E6EB',
              borderRadius: 6, marginBottom: 8, overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{t.status === 'done' ? '✅' : '⬜'}</span>
                  <span
                    onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                    style={{
                      fontSize: 13, textDecoration: t.status === 'done' ? 'line-through' : 'none',
                      cursor: 'pointer', flex: 1, minWidth: 0,
                    }}
                  >
                    <span style={{ fontSize: 10, color: '#64748B', marginRight: 4 }}>
                      {expandedTask === t.id ? '▾' : '▸'}
                    </span>
                    {t.description}
                  </span>
                  {t.template_key && (
                    <span style={{
                      fontSize: 10, color: '#64748B', background: '#E2E6EB',
                      borderRadius: 4, padding: '1px 6px', flexShrink: 0,
                    }}>
                      {t.template_key}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {t.due_at && (
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      {new Date(t.due_at).toLocaleDateString()}
                    </span>
                  )}
                  <button
                    onClick={() => deleteTask(t.id)}
                    title="Delete task"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#64748B', fontSize: 15, lineHeight: 1, padding: '0 2px',
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              {expandedTask === t.id && (
                <div style={{ padding: '8px 12px 12px 40px', background: '#F7F8FA', borderTop: '1px solid #E2E6EB' }}>
                  <label style={{ fontSize: 11, color: '#64748B', display: 'block', marginBottom: 4 }}>Notes</label>
                  <textarea
                    key={`notes-${t.id}`}
                    defaultValue={t.notes || ''}
                    onBlur={(e) => {
                      if (e.target.value !== (t.notes || '')) {
                        api.updateTask(t.id, { notes: e.target.value }).then(loadDeal);
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
          <div style={{ marginTop: 16 }}>
            <FollowUpScheduler dealId={parseInt(id)} onCreated={loadDeal} />
          </div>
        </div>
      )}

      {/* Scripts Tab */}
      {activeTab === 'scripts' && (
        <ScriptViewer deal={deal} contact={contact} company={company} />
      )}

      {/* Email Tab */}
      {activeTab === 'email' && (
        <div>
          <EmailComposer
            deal={deal}
            contact={contact}
            company={company}
            onSent={() => { loadDeal(); loadEmailThread(); }}
          />
          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: '#1B2838' }}>Email History</h3>
            {emailThread.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>No emails sent yet.</div>
            ) : (
              emailThread.map((email) => (
                <div key={email.id} style={{
                  background: '#fff', border: '1px solid #E2E6EB', borderRadius: 6,
                  padding: 14, marginBottom: 8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                        background: email.direction === 'outbound' ? '#1B2838' : '#E6FAF5',
                        color: email.direction === 'outbound' ? '#fff' : '#00D4AA',
                      }}>
                        {email.direction === 'outbound' ? 'SENT' : 'RECEIVED'}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1B2838' }}>{email.subject || '(no subject)'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {email.opened_at && (
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 4,
                          background: '#E6FAF5', color: '#00D4AA', fontWeight: 600,
                        }}>
                          Opened
                        </span>
                      )}
                      {email.clicked_at && (
                        <span style={{
                          fontSize: 10, padding: '2px 7px', borderRadius: 4,
                          background: '#EFF6FF', color: '#3B82F6', fontWeight: 600,
                        }}>
                          Clicked
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>
                        {new Date(email.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>
                    {email.direction === 'outbound' ? `To: ${email.to_email}` : `From: ${email.from_email}`}
                  </div>
                  <div style={{
                    fontSize: 12, color: '#64748B', whiteSpace: 'pre-wrap',
                    maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {email.body_text
                      ? email.body_text.replace(/<[^>]+>/g, '').substring(0, 200) + (email.body_text.length > 200 ? '...' : '')
                      : '(no preview)'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
