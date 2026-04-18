import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Cell,
} from 'recharts';

const money = (n) => '$' + Number(n || 0).toLocaleString();

function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, minWidth: 160,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#1B2838' }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16,
      marginBottom: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function safe(promise) { return promise.catch((err) => ({ _error: err.message })); }

const STATUS_COLORS = {
  new: '#94a3b8',
  working: '#00D4AA',
  won: '#047857',
  lost: '#dc2626',
};

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState([]);
  const [sources, setSources] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [clientRevenue, setClientRevenue] = useState([]);

  useEffect(() => {
    Promise.all([
      safe(api.getReportSummary()),
      safe(api.getReportStatus()),
      safe(api.getReportSources()),
      safe(api.getReportLostReasons()),
      safe(api.getReportMonthly()),
      safe(api.getReportClientRevenue()),
    ]).then(([s, st, src, lost, mo, cr]) => {
      if (s && !s._error) setSummary(s.summary);
      if (st && !st._error) setStatus(st.status || []);
      if (src && !src._error) setSources(src.sources || []);
      if (lost && !lost._error) setLostReasons(lost.reasons || []);
      if (mo && !mo._error) setMonthly(mo.monthly || []);
      if (cr && !cr._error) setClientRevenue(cr.clients || []);
    });
  }, []);

  // Monthly comes back most-recent-first; reverse for left-to-right chart.
  const monthlyChartData = [...monthly].reverse().map((m) => ({
    month: m.month,
    revenue: Number(m.revenue) || 0,
    count: m.count,
  }));

  const statusChartData = status.map((s) => ({
    status: s.status,
    count: s.count,
    fill: STATUS_COLORS[s.status] || '#64748B',
  }));

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Reports</h1>
      <div style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
        Rolling metrics across clients and engagements.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Stat label="Clients" value={summary?.clients ?? '—'} />
        <Stat label="Open engagements" value={summary?.openEngagements ?? '—'} />
        <Stat label="Pipeline value" value={summary ? money(summary.pipelineValue) : '—'} />
        <Stat label="Lifetime revenue" value={summary ? money(summary.lifetimeRevenue) : '—'} />
        <Stat label="Win rate" value={summary?.winRate != null ? `${summary.winRate}%` : '—'} />
        <Stat label="Avg cycle (days)" value={summary?.avgEngagementCycle ?? '—'} />
      </div>

      <Panel title="Monthly closed-won revenue (last 12 months)">
        {monthlyChartData.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>No closed deals yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={monthlyChartData} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E6EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} />
              <YAxis tickFormatter={(v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v)}
                tick={{ fontSize: 11, fill: '#64748B' }} />
              <Tooltip formatter={(v) => money(v)} />
              <Line type="monotone" dataKey="revenue" stroke="#00D4AA" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Panel title="Engagements by status">
          {statusChartData.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>—</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusChartData}>
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count">
                  {statusChartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Engagements by source">
          {sources.length === 0 ? (
            <div style={{ color: '#94a3b8', fontSize: 13 }}>—</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={sources} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} allowDecimals={false} />
                <YAxis type="category" dataKey="source" tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="count" fill="#00D4AA" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Lost reasons">
          {lostReasons.length === 0
            ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No lost engagements.</div>
            : lostReasons.map((r) => (
              <div key={r.lost_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                <span>{r.lost_reason}</span>
                <span style={{ fontWeight: 600 }}>{r.count}</span>
              </div>
            ))}
        </Panel>
      </div>

      <Panel title="Top clients by revenue">
        {clientRevenue.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13 }}>No clients yet.</div>
        ) : (
          <table style={{ width: '100%', fontSize: 13 }}>
            <thead>
              <tr style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, textAlign: 'left' }}>
                <th style={{ padding: '6px 0' }}>Client</th>
                <th style={{ padding: '6px 0' }}>Industry</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Lifetime</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Open pipeline</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Won / Total</th>
                <th style={{ padding: '6px 0' }}>First won</th>
                <th style={{ padding: '6px 0' }}>Last won</th>
              </tr>
            </thead>
            <tbody>
              {clientRevenue.slice(0, 20).map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '6px 0' }}>
                    <Link to={`/clients/${c.id}`} style={{ color: '#1B2838', textDecoration: 'none', fontWeight: 600 }}>
                      {c.name}
                    </Link>
                  </td>
                  <td style={{ padding: '6px 0', color: '#64748B' }}>{c.industry || '—'}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{money(c.lifetime_revenue)}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', color: '#64748B' }}>{money(c.open_pipeline)}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>{c.won_engagements} / {c.total_engagements}</td>
                  <td style={{ padding: '6px 0', color: '#64748B', fontSize: 11 }}>{c.first_won_at ? new Date(c.first_won_at).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '6px 0', color: '#64748B', fontSize: 11 }}>{c.last_won_at ? new Date(c.last_won_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
