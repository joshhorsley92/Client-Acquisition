import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: '#1B2838', borderRadius: 8, padding: 20, textAlign: 'center', flex: 1,
    }}>
      <div style={{ color: color || '#00D4AA', fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function activityIcon(type) {
  switch (type) {
    case 'call': return '📞';
    case 'email': return '✉';
    case 'meeting': return '📅';
    case 'note': return '📝';
    case 'stage_change': return '→';
    default: return '•';
  }
}

export default function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [todayTasks, setTodayTasks] = useState([]);
  const [overdueTasks, setOverdueTasks] = useState([]);
  const [staleDeals, setStaleDeals] = useState([]);
  const [pendingCalls, setPendingCalls] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaryRes, todayRes, overdueRes, staleRes, callsRes, activityRes] = await Promise.all([
          api.getReportSummary(),
          api.getTasks({ due: 'today', status: 'pending' }),
          api.getTasks({ due: 'overdue' }),
          api.getDeals({ stale_days: 14 }),
          api.getCalls({ review_status: 'pending' }),
          api.getActivities({ exclude_auto: 'true', limit: 10 }),
        ]);
        setStats(summaryRes.summary);
        setTodayTasks(todayRes.tasks || []);
        setOverdueTasks(overdueRes.tasks || []);
        setStaleDeals(staleRes.deals || []);
        setPendingCalls(callsRes.calls || []);
        setRecentActivity(activityRes.activities || []);
      } catch (err) {
        console.error('Home load failed:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const markTaskDone = async (taskId) => {
    try {
      await api.updateTask(taskId, { status: 'done' });
      setTodayTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch { /* ignore */ }
  };

  if (loading) return <div style={{ padding: 40, fontSize: 13, color: '#64748B' }}>Loading dashboard...</div>;

  const allTodayItems = [...overdueTasks.map((t) => ({ ...t, _overdue: true })), ...todayTasks];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'there'}
          </h1>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Here's what needs your attention today.
          </div>
        </div>
        <Link
          to="/pipeline"
          style={{
            padding: '8px 16px', background: '#fff', color: '#1B2838',
            border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13,
            fontWeight: 600, textDecoration: 'none',
          }}
        >
          Open Pipeline →
        </Link>
      </div>

      {/* Row 1: KPI cards */}
      {stats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <StatCard label="Active Deals" value={stats.activeDeals} />
          <StatCard label="Pipeline Value" value={`$${Number(stats.pipelineValue).toLocaleString()}`} />
          <StatCard label="Win Rate" value={`${stats.winRate}%`} color={stats.winRate >= 30 ? '#00D4AA' : '#E6A817'} />
          <StatCard
            label="Avg Deal Cycle"
            value={stats.avgDealCycle ? `${stats.avgDealCycle}d` : '—'}
          />
        </div>
      )}

      {/* Row 2: Today's tasks + overdue */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>
            Today's Tasks
            {allTodayItems.length > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: overdueTasks.length > 0 ? '#FEE2E2' : '#E6FAF5',
                color: overdueTasks.length > 0 ? '#dc2626' : '#00D4AA',
                fontWeight: 600,
              }}>
                {allTodayItems.length}{overdueTasks.length > 0 ? ` (${overdueTasks.length} overdue)` : ''}
              </span>
            )}
          </h3>
          <Link to="/tasks" style={{ fontSize: 12, color: '#00D4AA', textDecoration: 'none', fontWeight: 600 }}>
            View all →
          </Link>
        </div>

        {allTodayItems.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
            padding: 20, textAlign: 'center', fontSize: 13, color: '#64748B',
          }}>
            No tasks due today. Nice work!
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
            {allTodayItems.slice(0, 8).map((task, i) => (
              <div
                key={task.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 16px',
                  background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                  borderLeft: task._overdue ? '3px solid #dc2626' : '3px solid transparent',
                }}
              >
                <input
                  type="checkbox"
                  onChange={() => markTaskDone(task.id)}
                  style={{ cursor: 'pointer', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1B2838', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.description}
                  </div>
                  {task.company_name && (
                    <div style={{ fontSize: 11, color: '#64748B' }}>{task.company_name}</div>
                  )}
                </div>
                {task._overdue && (
                  <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600, flexShrink: 0 }}>OVERDUE</span>
                )}
                {task.deal_id && (
                  <Link
                    to={`/deals/${task.deal_id}`}
                    style={{ fontSize: 11, color: '#00D4AA', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}
                  >
                    Open deal
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Row 3: Needs attention — stale deals + pending calls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Stale Deals
            {staleDeals.length > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: '#FFF3E0', color: '#E6A817', fontWeight: 600,
              }}>
                {staleDeals.length}
              </span>
            )}
          </h3>
          {staleDeals.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 20, textAlign: 'center', fontSize: 13, color: '#64748B',
            }}>
              No stale deals. Pipeline is moving.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
              {staleDeals.slice(0, 5).map((deal, i) => (
                <Link
                  key={deal.id}
                  to={`/deals/${deal.id}`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', textDecoration: 'none',
                    background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                    borderLeft: '3px solid #E6A817',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#1B2838', fontWeight: 600 }}>{deal.company_name || `Deal #${deal.id}`}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{deal.stage?.replace('_', ' ')}</div>
                  </div>
                  {deal.fit_score != null && (
                    <span style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                      background: deal.fit_score >= 70 ? '#E6FAF5' : deal.fit_score >= 40 ? '#FFF3E0' : '#FEE2E2',
                      color: deal.fit_score >= 70 ? '#00D4AA' : deal.fit_score >= 40 ? '#E6A817' : '#dc2626',
                    }}>
                      {deal.fit_score}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
            Calls Pending Review
            {pendingCalls.length > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: '#FFF3E0', color: '#E6A817', fontWeight: 600,
              }}>
                {pendingCalls.length}
              </span>
            )}
          </h3>
          {pendingCalls.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 20, textAlign: 'center', fontSize: 13, color: '#64748B',
            }}>
              No calls waiting for review.
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
              {pendingCalls.slice(0, 5).map((call, i) => (
                <Link
                  key={call.id}
                  to={`/calls/${call.id}`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', textDecoration: 'none',
                    background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, color: '#1B2838', fontWeight: 600 }}>{call.company_name || `Call #${call.id}`}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {call.duration_minutes ? `${call.duration_minutes} min` : 'No duration'}
                      {call.transcript ? ' · Has transcript' : ' · Audio only'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                    background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
                  }}>
                    Pending
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Recent activity */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Recent Activity</h3>
        {recentActivity.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
            padding: 20, textAlign: 'center', fontSize: 13, color: '#64748B',
          }}>
            No recent activity.
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
            {recentActivity.map((act, i) => (
              <div
                key={act.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '10px 16px',
                  background: i % 2 === 0 ? '#fff' : '#F7F8FA',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{activityIcon(act.type)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#1B2838' }}>
                    {act.content || act.type}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    {act.company_name && <span>{act.company_name} · </span>}
                    {formatDate(act.created_at)}
                  </div>
                </div>
                {act.deal_id && (
                  <Link
                    to={`/deals/${act.deal_id}`}
                    style={{ fontSize: 11, color: '#00D4AA', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}
                  >
                    Open
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
