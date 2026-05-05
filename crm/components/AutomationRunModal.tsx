'use client';

// Engagement-scoped automation runner. Lives in a modal so the trigger
// can be a button on any surface (engagement cards, engagement detail,
// etc.) — automations are an action you take ON an engagement, so this
// is the natural shape.
//
// Picks an automation from the catalog → POST /api/automations/run →
// polls /api/automations/job/[id] every 2s → renders the markdown output
// in-place when complete.

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Modal from './Modal';
import {
  Field, Select, ErrorBox, PrimaryButton, SecondaryButton,
} from './ui/Forms';
import { Spinner } from './Skeleton';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

interface AutomationDef {
  key: string;
  requiresEngagement: boolean;
  usesBrandProfile: boolean;
}

interface JobState {
  id: number;
  status: 'running' | 'completed' | 'failed';
  output?: string | null;
  error?: string | null;
  completed_at?: string | null;
  brand_profile_source?: { origin: string } | null;
  automation: string;
}

export default function AutomationRunModal({
  open, onClose, engagement, onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  engagement: { id: number; client_id: number; client_name?: string; package_type?: string | null };
  onCompleted?: (jobId: number) => void;
}) {
  const [catalog, setCatalog] = useState<AutomationDef[]>([]);
  const [automation, setAutomation] = useState('');
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  // Load catalog when the modal first opens.
  useEffect(() => {
    if (!open) return;
    api.get<{ automations: AutomationDef[] }>('/api/automations/catalog')
      .then((d) => {
        setCatalog(d.automations);
        if (d.automations[0] && !automation) setAutomation(d.automations[0].key);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset transient state when the modal closes.
  useEffect(() => {
    if (!open) {
      setJob(null);
      setError('');
      setStarting(false);
    }
  }, [open]);

  // Poll while a job is running.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let cancelled = false;
    const tick = async () => {
      try {
        const { job: fresh } = await api.get<{ job: JobState }>(`/api/automations/job/${job.id}`);
        if (cancelled) return;
        setJob({ ...fresh, automation: job.automation });
        if (fresh.status === 'completed') onCompleted?.(job.id);
      } catch { /* keep polling */ }
    };
    const handle = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [job?.id, job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const meta = catalog.find((a) => a.key === automation);

  async function run() {
    setError(''); setStarting(true); setJob(null);
    try {
      const data = await api.post<any>('/api/automations/run', {
        automation,
        client_id: engagement.client_id,
        engagement_id: engagement.id,
      });
      setJob({
        id: data.job_id,
        status: data.status,
        automation: data.automation,
        brand_profile_source: data.brand_profile_source,
      });
    } catch (err: unknown) {
      setError(humanizeError(err, 'Failed to start the automation.'));
    } finally {
      setStarting(false);
    }
  }

  async function copyOutput() {
    if (!job?.output) return;
    try {
      await navigator.clipboard.writeText(job.output);
      toast.success('Output copied to clipboard.');
    } catch {
      toast.error('Could not copy. Select the text manually.');
    }
  }

  const engagementLabel = `${engagement.package_type || 'Engagement'} #${engagement.id}`;

  return (
    <Modal
      open={open}
      onClose={starting || job?.status === 'running' ? undefined : onClose}
      title={`Run automation — ${engagementLabel}`}
      width={680}
    >
      {engagement.client_name && (
        <p className="text-[12px] text-ink-muted mb-3">
          Client: <strong className="text-ink">{engagement.client_name}</strong>
        </p>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
        <Field label="Automation">
          <Select
            value={automation}
            onChange={(e) => setAutomation(e.target.value)}
            disabled={catalog.length === 0 || starting || job?.status === 'running'}
          >
            {catalog.length === 0 && <option value="">— loading —</option>}
            {catalog.map((a) => (
              <option key={a.key} value={a.key}>{a.key}</option>
            ))}
          </Select>
        </Field>
        <PrimaryButton
          type="button"
          onClick={run}
          disabled={!automation || starting || job?.status === 'running'}
        >
          {starting ? 'Starting…' : job?.status === 'running' ? 'Running…' : 'Run'}
        </PrimaryButton>
      </div>
      {meta?.usesBrandProfile && (
        <div className="text-[11px] text-ink-faint mt-2">
          Uses the client&apos;s Brand Profile when available (falls back to call extractions).
        </div>
      )}

      {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}

      {job && (
        <div className="mt-4 border-t border-surface-alt pt-4">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[13px] font-bold text-ink">Job #{job.id}</span>
            <StatusPill status={job.status} />
            {job.brand_profile_source?.origin && (
              <span className="text-[11px] text-ink-muted">
                Brand profile from {job.brand_profile_source.origin}
              </span>
            )}
          </div>

          {job.status === 'running' && (
            <div className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Spinner size={14} />
              Calling Claude — usually 10–30 seconds…
            </div>
          )}

          {job.status === 'failed' && (
            <ErrorBox>{job.error || 'Generation failed'}</ErrorBox>
          )}

          {job.status === 'completed' && job.output && (
            <>
              {job.completed_at && (
                <div className="text-[11px] text-ink-muted mb-2">
                  Completed {new Date(job.completed_at).toLocaleString()}
                </div>
              )}
              <article
                className={cn(
                  'bg-surface-page p-4 rounded text-[13px] max-h-[50vh] overflow-auto',
                  '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
                  '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5',
                  '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1',
                  '[&_p]:my-2 [&_p]:leading-relaxed',
                  '[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2',
                  '[&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2',
                  '[&_li]:my-0.5',
                  '[&_strong]:font-semibold [&_em]:italic',
                  '[&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono',
                  '[&_a]:text-brand-mint [&_a]:underline',
                  '[&_blockquote]:border-l-4 [&_blockquote]:border-edge [&_blockquote]:pl-3 [&_blockquote]:text-ink-muted',
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {job.output}
                </ReactMarkdown>
              </article>
              <div className="flex justify-end gap-2 mt-3">
                <SecondaryButton onClick={copyOutput}>Copy to clipboard</SecondaryButton>
                <PrimaryButton onClick={onClose}>Done</PrimaryButton>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    running:   'bg-warning-bg text-warning border-warning-border',
    completed: 'bg-success-bg text-success border-success-border',
    failed:    'bg-danger-bg text-danger-strong border-danger-border',
  };
  return (
    <span className={cn(
      'text-[11px] px-2.5 py-0.5 rounded-full border font-semibold capitalize',
      tones[status] || tones.running,
    )}>
      {status}
    </span>
  );
}
