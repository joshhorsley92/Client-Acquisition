import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

const money = (n) => '$' + Number(n || 0).toLocaleString();

function fmtDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(String(ts).includes('T') ? ts : String(ts).replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleString();
}

function Card({ label, value, tone = 'default', hint }) {
  const valueColor = tone === 'accent' ? '#00D4AA' : tone === 'muted' ? '#94a3b8' : '#1B2838';
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: valueColor }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Panel({ title, children, right }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {title}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function safe(promise) { return promise.catch((err) => ({ _error: err.message })); }

const activityTone = {
  note: '#1B2838',
  call: '#00D4AA',
  email: '#00D4AA',
  meeting: '#A16207',
  status_change: '#0369a1',
  system: '#64748B',
};

export default function Home() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [topClients, setTopClients] = useState([]);
  const [activities, setActivities] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    Promise.all([
      safe(api.getReportSummary()),
      safe(api.getReportClientRevenue()),
      safe(api.getActivities({ limit: 15, exclude_auto: 'true' })),
    ]).then(([s, cr, act]) => {
      if (s && !s._error) setSummary(s.summary);
      if (cr && !cr._error) setTopClients((cr.clients || []).slice(0, 5));
      if (act && !act._error) setActivities(act.activities || []);
      if (s?._error) setErr(s._error);
    });
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ fontSize: 24, margin: 0 }}>
          Hi {user?.name?.split(' ')[0] || 'there'}
        </h1>
        <Link to="/clients" style={{
          background: '#00D4AA', color: '#1B2838', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontWeight: 600, fontSize: 13, textDecoration: 'none',
        }}>
          + New Client
        </Link>
      </div>
      <div style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
        Here's the state of the pipeline at a glance.
      </div>

      {err && (
        <div style={{
          padding: 12, marginBottom: 16,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
          borderRadius: 6, fontSize: 13,
        }}>
          Couldn't load summary: {err}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <Card label="Clients" value={summary?.clients ?? '—'} />
        <Card label="Open engagements" value={summary?.openEngagements ?? '—'} tone="accent" />
        <Card label="Pipeline value" value={summary ? money(summary.pipelineValue) : '—'} />
        <Card label="Lifetime revenue" value={summary ? money(summary.lifetimeRevenue) : '—'} tone="accent" />
        <Card label="Win rate" value={summary?.winRate != null ? `${summary.winRate}%` : '—'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }}>
        <Panel
          title="Top clients by revenue"
          right={<Link to="/reports" style={{ fontSize: 12, color: '#00D4AA', textDecoration: 'none' }}>See all →</Link>}
        >
          {topClients.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>
              No won engagements yet — close one to see it here.
            </div>
          ) : (
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                {topClients.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 0' }}>
                      <Link to={`/clients/${c.id}`} style={{ color: '#1B2838', textDecoration: 'none', fontWeight: 600 }}>
                        {c.name}
                      </Link>
                      {c.industry && <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>{c.industry}</span>}
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>
                      {money(c.lifetime_revenue)}
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
                      {c.won_engagements} won
                      {c.open_engagements > 0 && ` · ${c.open_engagements} open`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Recent activity">
          {activities.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13, padding: 8 }}>
              Nothing yet. Add a note on a client or close an engagement to see activity here.
            </div>
          ) : (
            <div>
              {activities.map((a) => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                    <span>
                      <span style={{
                        fontSize: 10, textTransform: 'uppercase', fontWeight: 600,
                        color: activityTone[a.type] || '#64748B',
                        letterSpacing: '0.04em',
                      }}>
                        {a.type.replace('_', ' ')}
                      </span>
                      {' · '}
                      <Link to={`/clients/${a.client_id}`} style={{ color: '#1B2838', textDecoration: 'none', fontWeight: 600 }}>
                        {a.client_name}
                      </Link>
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDateTime(a.created_at)}</span>
                  </div>
                  {a.content && (
                    <div style={{ color: '#64748B', whiteSpace: 'pre-wrap', marginTop: 2 }}>{a.content}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
