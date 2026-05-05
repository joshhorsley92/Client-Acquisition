'use client';

// Automations page — pick a registered automation, pick a client +
// (optional) engagement, click Run. Polls the resulting generation_jobs
// row and renders the output Markdown when complete.

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface AutomationDef {
  key: string;
  requiresEngagement: boolean;
  usesBrandProfile: boolean;
}

export default function AutomationsPage() {
  const [catalog, setCatalog] = useState<AutomationDef[]>([]);
  const [clients, setClients] = useState<Array<{ id: number; name: string }>>([]);
  const [engagements, setEngagements] = useState<Array<{ id: number; client_id: number; package_type: string | null; status: string }>>([]);

  const [automation, setAutomation] = useState('');
  const [clientId, setClientId] = useState('');
  const [engagementId, setEngagementId] = useState('');

  const [job, setJob] = useState<any>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api.get<{ automations: AutomationDef[] }>('/api/automations/catalog')
      .then((d) => { setCatalog(d.automations); if (d.automations[0]) setAutomation(d.automations[0].key); })
      .catch(() => {});
    api.get<{ clients: any[] }>('/api/clients?sort_by=name&sort_dir=asc')
      .then((d) => setClients((d.clients || []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    api.get<{ engagements: any[] }>('/api/engagements')
      .then((d) => setEngagements(d.engagements || []))
      .catch(() => {});
  }, []);

  // Poll the running job
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { job: fresh } = await api.get<{ job: any }>(`/api/automations/job/${job.id}`);
        if (!cancelled) setJob(fresh);
      } catch { /* keep polling */ }
    };
    const handle = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [job?.id, job?.status]);

  const meta = catalog.find((a) => a.key === automation);
  const clientEngagements = engagements.filter((e) => String(e.client_id) === clientId);

  async function run() {
    setError(''); setStarting(true); setJob(null);
    try {
      const body: any = { automation, client_id: Number(clientId) };
      if (meta?.requiresEngagement) {
        if (!engagementId) { setError('Pick an engagement'); return; }
        body.engagement_id = Number(engagementId);
      }
      const data = await api.post<any>('/api/automations/run', body);
      setJob({ id: data.job_id, status: data.status, automation: data.automation, brand_profile_source: data.brand_profile_source });
    } catch (err: any) {
      setError(err.message || 'Failed to start');
    } finally { setStarting(false); }
  }

  return (
    <div>
      <h1 style={h1}>Automations</h1>

      <div style={panel}>
        <h2 style={h2}>Run an automation</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
          <Field label="Automation">
            <select value={automation} onChange={(e) => setAutomation(e.target.value)} style={input}>
              {catalog.map((a) => <option key={a.key} value={a.key}>{a.key}</option>)}
            </select>
          </Field>
          <Field label="Client">
            <select value={clientId} onChange={(e) => { setClientId(e.target.value); setEngagementId(''); }} style={input}>
              <option value="">— select —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {meta?.requiresEngagement && (
            <Field label="Engagement">
              <select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} style={input} disabled={!clientId}>
                <option value="">— select —</option>
                {clientEngagements.map((e) => (
                  <option key={e.id} value={e.id}>#{e.id} · {e.package_type || 'engagement'} · {e.status}</option>
                ))}
              </select>
            </Field>
          )}
          <button
            onClick={run}
            disabled={starting || !clientId || (meta?.requiresEngagement && !engagementId) || (job?.status === 'running')}
            style={primaryBtn(starting || !clientId || (meta?.requiresEngagement && !engagementId) || (job?.status === 'running'))}
          >
            {starting ? 'Starting…' : job?.status === 'running' ? 'Running…' : 'Run'}
          </button>
        </div>
        {meta?.usesBrandProfile && (
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
            Uses the client&apos;s Brand Profile when available (falls back to call extractions).
          </div>
        )}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      {job && (
        <div style={{ ...panel, marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ ...h2, marginBottom: 0 }}>Job #{job.id}</h2>
            <span style={statusPill(job.status)}>{job.status}</span>
            {job.brand_profile_source && (
              <span style={{ fontSize: 11, color: '#64748B' }}>
                Brand profile from {job.brand_profile_source.origin}
              </span>
            )}
          </div>
          {job.status === 'running' && (
            <div style={{ fontSize: 13, color: '#64748B' }}>
              Calling Claude — usually 10-30 seconds depending on prompt length…
            </div>
          )}
          {job.status === 'failed' && (
            <div style={errorBox}>{job.error || 'Generation failed'}</div>
          )}
          {job.status === 'completed' && (
            <div>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                Completed {new Date(job.completed_at).toLocaleString()}
              </div>
              <pre style={{
                background: '#F7F8FA', padding: 16, borderRadius: 4,
                fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'inherit', maxHeight: '60vh', overflow: 'auto',
              }}>{job.output}</pre>
              <button
                onClick={() => navigator.clipboard.writeText(job.output)}
                style={{ ...secondaryBtn, marginTop: 8 }}
              >
                Copy to clipboard
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#64748B', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
function statusPill(status: string): React.CSSProperties {
  const tones: Record<string, { bg: string; color: string; border: string }> = {
    running: { bg: '#FFF8E6', color: '#A16207', border: '#FCD34D' },
    completed: { bg: '#E6FAF5', color: '#047857', border: '#6EE7B7' },
    failed: { bg: '#FEF2F2', color: '#991b1b', border: '#FCA5A5' },
  };
  const t = tones[status] || tones.running;
  return {
    fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
    background: t.bg, color: t.color, border: `1px solid ${t.border}`,
  };
}

const h1: React.CSSProperties = { fontSize: 24, fontWeight: 700, margin: '0 0 16px 0' };
const h2: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: '#1B2838', margin: '0 0 12px 0' };
const panel: React.CSSProperties = {
  background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #E2E6EB',
};
const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box',
};
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginTop: 12,
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
