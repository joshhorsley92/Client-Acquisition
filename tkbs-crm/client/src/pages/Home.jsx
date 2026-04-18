import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../App';

// Phase 3A placeholder. Pulls the new /reports/summary shape so the
// dashboard isn't empty while we build the rich home experience in 3B
// (recent activity feed, top clients, open engagements by status, etc.).

function Card({ label, value, tone = 'default' }) {
  const valueColor = tone === 'accent' ? '#00D4AA' : tone === 'muted' ? '#94a3b8' : '#1B2838';
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: 16,
    }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.getReportSummary()
      .then((d) => setSummary(d.summary))
      .catch((e) => setErr(e.message));
  }, []);

  const money = (n) => '$' + Number(n || 0).toLocaleString();

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>
        Hi {user?.name?.split(' ')[0] || 'there'}
      </h1>
      <div style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
        Phase 3A snapshot — a richer dashboard ships in 3B.
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <Card label="Clients" value={summary?.clients ?? '—'} />
        <Card label="Open engagements" value={summary?.openEngagements ?? '—'} tone="accent" />
        <Card label="Pipeline value" value={summary ? money(summary.pipelineValue) : '—'} />
        <Card label="Lifetime revenue" value={summary ? money(summary.lifetimeRevenue) : '—'} tone="accent" />
        <Card label="Win rate" value={summary?.winRate != null ? `${summary.winRate}%` : '—'} />
      </div>

      <div style={{
        padding: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        color: '#475569', fontSize: 14,
      }}>
        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>Next steps</div>
        <div>
          Head to <Link to="/clients" style={{ color: '#00D4AA' }}>Clients</Link> to add a new
          prospect — the backend will kick off enrichment automatically if you include a website.
        </div>
      </div>
    </div>
  );
}
