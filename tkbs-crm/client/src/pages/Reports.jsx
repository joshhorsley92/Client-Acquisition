import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#1B2838', borderRadius: 8, padding: 20, textAlign: 'center',
    }}>
      <div style={{ color: color || '#00D4AA', fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [sources, setSources] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getReportSummary(),
      api.getReportFunnel(),
      api.getReportSources(),
      api.getReportLostReasons(),
    ]).then(([sumData, funnelData, srcData, lostData]) => {
      setSummary(sumData.summary);
      setFunnel(funnelData.funnel);
      setSources(srcData.sources);
      setLostReasons(lostData.reasons);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading reports...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Reports</h1>

      {/* Summary cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Active Deals" value={summary.activeDeals} />
          <StatCard label="Pipeline Value/mo" value={`$${Number(summary.pipelineValue).toLocaleString()}`} />
          <StatCard label="Win Rate" value={`${summary.winRate}%`} />
          <StatCard label="Avg Deal Cycle" value={summary.avgDealCycle ? `${summary.avgDealCycle}d` : '—'} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Funnel */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pipeline Funnel</h3>
          {funnel.map(f => (
            <div key={f.stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{f.stage.replace('_', ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{f.count}</span>
            </div>
          ))}
          {funnel.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        {/* Sources */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Deals by Source</h3>
          {sources.map(s => (
            <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{s.source}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{s.count}</span>
            </div>
          ))}
          {sources.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        {/* Lost Reasons */}
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Lost Deal Reasons</h3>
          {lostReasons.map(r => (
            <div key={r.lost_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{r.lost_reason}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{r.count}</span>
            </div>
          ))}
          {lostReasons.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No lost deals yet.</div>}
        </div>

        {/* Quick stats */}
        {summary && (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Closed Deals</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>Won</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{summary.totalWon}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 13 }}>Lost</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{summary.totalLost}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
