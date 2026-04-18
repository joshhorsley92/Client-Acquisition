import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';

// Phase 3A placeholder. The old v1 charts (funnel, velocity, time-investment)
// don't match the new 4-status model. The full reports page with charts +
// Top Clients by Revenue ships in Phase 3B. This placeholder pulls the
// already-working summary/status/sources/lost-reasons/monthly endpoints so
// something useful renders in the meantime.

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

  const money = (n) => '$' + Number(n || 0).toLocaleString();

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Reports</h1>
      <div style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
        Phase 3A — a full charted dashboard with Top Clients by Revenue ships in 3B.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Stat label="Clients" value={summary?.clients ?? '—'} />
        <Stat label="Open engagements" value={summary?.openEngagements ?? '—'} />
        <Stat label="Pipeline value" value={summary ? money(summary.pipelineValue) : '—'} />
        <Stat label="Lifetime revenue" value={summary ? money(summary.lifetimeRevenue) : '—'} />
        <Stat label="Win rate" value={summary?.winRate != null ? `${summary.winRate}%` : '—'} />
        <Stat label="Avg cycle (days)" value={summary?.avgEngagementCycle ?? '—'} />
      </div>

      <Panel title="Engagements by status">
        {status.length === 0
          ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No engagements yet.</div>
          : (
            <table style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                {status.map((row) => (
                  <tr key={row.status} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0', textTransform: 'capitalize' }}>{row.status}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Panel>

      <Panel title="Top clients by revenue">
        {clientRevenue.length === 0
          ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No clients yet.</div>
          : (
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: 11, textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Client</th>
                  <th style={{ padding: '6px 0', textAlign: 'right' }}>Lifetime</th>
                  <th style={{ padding: '6px 0', textAlign: 'right' }}>Won</th>
                  <th style={{ padding: '6px 0', textAlign: 'right' }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {clientRevenue.slice(0, 10).map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0' }}>{c.name}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 600 }}>{money(c.lifetime_revenue)}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>{c.won_engagements}</td>
                    <td style={{ padding: '6px 0', textAlign: 'right' }}>{c.open_engagements}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <Panel title="By source">
          {sources.length === 0
            ? <div style={{ color: '#94a3b8', fontSize: 13 }}>—</div>
            : sources.map((s) => (
              <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>{s.source}</span>
                <span style={{ fontWeight: 600 }}>{s.count}</span>
              </div>
            ))}
        </Panel>

        <Panel title="Lost reasons">
          {lostReasons.length === 0
            ? <div style={{ color: '#94a3b8', fontSize: 13 }}>—</div>
            : lostReasons.map((r) => (
              <div key={r.lost_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>{r.lost_reason}</span>
                <span style={{ fontWeight: 600 }}>{r.count}</span>
              </div>
            ))}
        </Panel>

        <Panel title="Monthly revenue (closed-won)">
          {monthly.length === 0
            ? <div style={{ color: '#94a3b8', fontSize: 13 }}>—</div>
            : monthly.map((m) => (
              <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                <span>{m.month}</span>
                <span style={{ fontWeight: 600 }}>{money(m.revenue)}</span>
              </div>
            ))}
        </Panel>
      </div>
    </div>
  );
}
