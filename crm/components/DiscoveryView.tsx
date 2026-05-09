'use client';

// Lead Discovery — search panel + active-job progress + triage list.
//
// Flow: pick source + filters → POST /run → progress modal polls /job/[id]
// every 2s and fires /enrich-next while pending > 0 → on completion the
// triage list re-loads and the user dismisses or promotes each candidate.
//
// Mirrors the polling pattern in AutomationRunModal (2s setInterval).

import { useEffect, useRef, useState } from 'react';
import { Search, X, ExternalLink, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import {
  Field, Input, Select, ErrorBox, PrimaryButton, SecondaryButton, DangerButton,
} from '@/components/ui/Forms';
import { Spinner } from '@/components/Skeleton';
import OpportunityBadge from '@/components/OpportunityBadge';
import { labelFor, type OpportunitySignal } from '@/services/lead-discovery/scoring';
import { cn } from '@/lib/cn';

interface SourceMeta { key: string; label: string; available?: boolean }

interface Candidate {
  id: number;
  job_id: number | null;
  source: string;
  source_id: string;
  name: string;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  industry: string | null;
  google_rating: number | null;
  google_reviews_ct: number | null;
  enrichment_data: Record<string, unknown> | null;
  opportunity_score: number | null;
  opportunity_signals: OpportunitySignal[] | null;
  status: string;
  enriched_at: string | null;
  created_at: string;
}

interface JobState {
  id: number;
  status: 'discovering' | 'enriching' | 'completed' | 'failed';
  source: string;
  discovered_count: number;
  enriched_count: number;
  error: string | null;
}

interface JobResponse {
  job: JobState;
  counts: Record<string, number>;
}

export default function DiscoveryView() {
  const [sources, setSources] = useState<SourceMeta[]>([]);
  const [allSources, setAllSources] = useState<SourceMeta[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeJob, setActiveJob] = useState<JobState | null>(null);
  const [activeCounts, setActiveCounts] = useState<Record<string, number>>({});
  const [openFilters, setOpenFilters] = useState(true);
  const [openCandidate, setOpenCandidate] = useState<Candidate | null>(null);
  const [reEnriching, setReEnriching] = useState<Set<number>>(new Set());

  // Filter form state
  const [source, setSource] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('Michigan');
  const [maxRating, setMaxRating] = useState<string>('');
  const [maxReviews, setMaxReviews] = useState<string>('');
  const [hasWebsite, setHasWebsite] = useState<'any' | 'yes' | 'no'>('any');
  const [limit, setLimit] = useState<string>('20');
  const [submitting, setSubmitting] = useState(false);

  const enrichInflight = useRef(false);

  async function loadCandidates() {
    setErr('');
    try {
      const data = await api.get<{ candidates: Candidate[] }>(`/api/lead-discovery/candidates?status=enriched&limit=200`);
      setCandidates(data.candidates || []);
    } catch (e: unknown) {
      setErr(humanizeError(e, 'Failed to load candidates.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    api.get<{ sources: SourceMeta[]; all: SourceMeta[] }>('/api/lead-discovery/sources')
      .then((d) => {
        setSources(d.sources || []);
        setAllSources(d.all || []);
        if (!source && d.sources?.[0]) setSource(d.sources[0].key);
      })
      .catch(() => {});
    void loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while a job is active. On each tick, also kick off /enrich-next
  // when there are pending candidates AND no enrich call is currently in
  // flight from this client.
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.status === 'completed' || activeJob.status === 'failed') return;
    let cancelled = false;

    const tick = async () => {
      try {
        const fresh = await api.get<JobResponse>(`/api/lead-discovery/job/${activeJob.id}`);
        if (cancelled) return;
        setActiveJob(fresh.job);
        setActiveCounts(fresh.counts);

        const pending = fresh.counts.discovered ?? 0;
        if (pending > 0 && !enrichInflight.current && fresh.job.status === 'enriching') {
          enrichInflight.current = true;
          api.post<{ enriched: number; remaining: number; finalized: boolean }>(
            '/api/lead-discovery/enrich-next',
            { job_id: activeJob.id },
          )
            .catch(() => {})
            .finally(() => { enrichInflight.current = false; });
        }

        if (fresh.job.status === 'completed') {
          void loadCandidates();
        }
      } catch { /* keep polling */ }
    };
    void tick();
    const handle = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

  async function startSearch() {
    if (!source) return;
    setSubmitting(true); setErr('');
    try {
      const filters: Record<string, unknown> = {};
      if (industry.trim()) filters.industry = industry.trim();
      if (location.trim()) filters.location = location.trim();
      if (maxRating) filters.max_rating = Number(maxRating);
      if (maxReviews) filters.max_reviews = Number(maxReviews);
      if (hasWebsite === 'yes') filters.has_website = true;
      else if (hasWebsite === 'no') filters.has_website = false;
      if (limit) filters.limit = Number(limit);

      const res = await api.post<{ job_id: number; status: JobState['status']; discovered: number; total_returned: number; duplicates_skipped: number }>(
        '/api/lead-discovery/run',
        { source, filters },
      );
      setActiveJob({
        id: res.job_id,
        status: res.status,
        source,
        discovered_count: res.discovered,
        enriched_count: 0,
        error: null,
      });
      setActiveCounts({ discovered: res.discovered });
      setOpenFilters(false);
      if (res.discovered === 0) {
        if (res.duplicates_skipped > 0) {
          toast.success(`No new leads — ${res.duplicates_skipped} already in the pool.`);
        } else {
          toast.success('Search returned no leads. Try widening the filters.');
        }
      } else {
        toast.success(`Discovered ${res.discovered} leads. Enriching now…`);
      }
    } catch (e: unknown) {
      setErr(humanizeError(e, 'Failed to start lead discovery.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function dismiss(c: Candidate) {
    try {
      await api.post(`/api/lead-discovery/candidates/${c.id}/dismiss`);
      setCandidates((prev) => prev.filter((x) => x.id !== c.id));
      if (openCandidate?.id === c.id) setOpenCandidate(null);
      toast.success(`Dismissed ${c.name}.`);
    } catch (e: unknown) {
      toast.error(humanizeError(e, 'Failed to dismiss.'));
    }
  }

  async function reEnrich(c: Candidate) {
    setReEnriching((prev) => new Set(prev).add(c.id));
    try {
      const res = await api.post<{ candidate: Candidate }>(
        `/api/lead-discovery/candidates/${c.id}/re-enrich`,
      );
      setCandidates((prev) => prev.map((x) => (x.id === c.id ? res.candidate : x)));
      if (openCandidate?.id === c.id) setOpenCandidate(res.candidate);
      toast.success(`Re-enriched ${c.name}.`);
    } catch (e: unknown) {
      toast.error(humanizeError(e, 'Failed to re-enrich.'));
    } finally {
      setReEnriching((prev) => {
        const next = new Set(prev);
        next.delete(c.id);
        return next;
      });
    }
  }

  async function promote(c: Candidate) {
    try {
      const res = await api.post<{ client_id: number; already_existed?: boolean }>(
        `/api/lead-discovery/candidates/${c.id}/promote`,
      );
      setCandidates((prev) => prev.filter((x) => x.id !== c.id));
      if (openCandidate?.id === c.id) setOpenCandidate(null);
      toast.success(
        res.already_existed
          ? `Already in CRM as client #${res.client_id}.`
          : `Promoted to client #${res.client_id}.`,
      );
    } catch (e: unknown) {
      toast.error(humanizeError(e, 'Failed to promote.'));
    }
  }

  const noSourcesAvailable = sources.length === 0 && allSources.length > 0;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold m-0">Discovery</h1>
        <SecondaryButton onClick={() => setOpenFilters((v) => !v)}>
          {openFilters ? 'Hide search' : 'New search'}
        </SecondaryButton>
      </div>

      {noSourcesAvailable && (
        <ErrorBox>
          No discovery sources configured. Set <code className="font-mono">GOOGLE_PLACES_API_KEY</code> in <code className="font-mono">crm/.env.local</code> to enable Google Places.
        </ErrorBox>
      )}

      {openFilters && (
        <div className="bg-surface rounded-lg border border-edge p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Source" required>
              <Select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={sources.length === 0}
              >
                {sources.length === 0 && <option value="">— none configured —</option>}
                {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Industry / keyword">
              <Input
                placeholder="boutique, contractor, salon, …"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </Field>
            <Field label="Location">
              <Input
                placeholder="Detroit, MI or 48226"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field label="Result cap">
              <Input
                type="number"
                min={1}
                max={20}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
            <Field label="Max Google rating">
              <Input
                type="number"
                min={0}
                max={5}
                step={0.1}
                placeholder="e.g. 3.5"
                value={maxRating}
                onChange={(e) => setMaxRating(e.target.value)}
              />
            </Field>
            <Field label="Max Google reviews">
              <Input
                type="number"
                min={0}
                placeholder="e.g. 50"
                value={maxReviews}
                onChange={(e) => setMaxReviews(e.target.value)}
              />
            </Field>
            <Field label="Has website?">
              <Select value={hasWebsite} onChange={(e) => setHasWebsite(e.target.value as typeof hasWebsite)}>
                <option value="any">Either</option>
                <option value="yes">Has website</option>
                <option value="no">No website</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <PrimaryButton
                type="button"
                onClick={startSearch}
                disabled={!source || submitting || activeJob?.status === 'discovering' || activeJob?.status === 'enriching'}
                className="w-full"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Search size={14} />
                  {submitting ? 'Starting…' : 'Find leads'}
                </span>
              </PrimaryButton>
            </div>
          </div>
          <p className="text-[11px] text-ink-faint mt-2">
            More weakness signals = higher opportunity score. Try a low Max Rating + low Review count to surface businesses likely to need help.
          </p>
        </div>
      )}

      {activeJob && (
        <JobProgress
          job={activeJob}
          counts={activeCounts}
          onClose={() => { setActiveJob(null); void loadCandidates(); }}
        />
      )}

      {err && <ErrorBox>{err}</ErrorBox>}

      {loading ? (
        <div className="text-ink-faint text-[13px] flex items-center gap-2">
          <Spinner /> Loading candidates…
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-surface p-10 rounded-lg border border-edge text-center text-ink-muted text-[13px]">
          No enriched candidates yet. Run a search to populate the triage list.
        </div>
      ) : (
        <CandidatesTable
          candidates={candidates}
          reEnriching={reEnriching}
          onOpen={setOpenCandidate}
          onPromote={promote}
          onDismiss={dismiss}
          onReEnrich={reEnrich}
        />
      )}

      {openCandidate && (
        <CandidateDetailPanel
          candidate={openCandidate}
          reEnriching={reEnriching.has(openCandidate.id)}
          onClose={() => setOpenCandidate(null)}
          onPromote={() => promote(openCandidate)}
          onDismiss={() => dismiss(openCandidate)}
          onReEnrich={() => reEnrich(openCandidate)}
        />
      )}
    </div>
  );
}

function JobProgress({
  job, counts, onClose,
}: {
  job: JobState;
  counts: Record<string, number>;
  onClose: () => void;
}) {
  const total = (counts.discovered ?? 0) + (counts.enriched ?? 0) + (counts.failed ?? 0) + (counts.enriching ?? 0);
  const done = (counts.enriched ?? 0) + (counts.failed ?? 0);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const isRunning = job.status === 'discovering' || job.status === 'enriching';

  return (
    <div className="bg-surface rounded-lg border border-edge p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-ink">Job #{job.id}</span>
          <StatusPill status={job.status} />
          <span className="text-[12px] text-ink-muted">
            {counts.enriched ?? 0} enriched · {counts.discovered ?? 0} pending · {counts.failed ?? 0} failed
          </span>
        </div>
        {!isRunning && (
          <SecondaryButton onClick={onClose} className="px-3 py-1 text-xs">Close</SecondaryButton>
        )}
      </div>
      {isRunning && (
        <>
          <div className="h-1.5 bg-surface-page rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-mint transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-2 text-[12px] text-ink-muted">
            <Spinner size={12} />
            <span>
              {job.status === 'discovering' ? 'Searching the source…' : `Enriching candidates ${pct}%`}
            </span>
          </div>
        </>
      )}
      {job.status === 'failed' && (
        <ErrorBox>{job.error || 'Job failed.'}</ErrorBox>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tones: Record<string, string> = {
    discovering: 'bg-warning-bg text-warning border-warning-border',
    enriching:   'bg-warning-bg text-warning border-warning-border',
    completed:   'bg-success-bg text-success border-success-border',
    failed:      'bg-danger-bg text-danger-strong border-danger-border',
  };
  return (
    <span className={cn(
      'text-[11px] px-2.5 py-0.5 rounded-full border font-semibold capitalize',
      tones[status] || tones.discovering,
    )}>
      {status}
    </span>
  );
}

function CandidatesTable({
  candidates, reEnriching, onOpen, onPromote, onDismiss, onReEnrich,
}: {
  candidates: Candidate[];
  reEnriching: Set<number>;
  onOpen: (c: Candidate) => void;
  onPromote: (c: Candidate) => void;
  onDismiss: (c: Candidate) => void;
  onReEnrich: (c: Candidate) => void;
}) {
  return (
    <div className="bg-surface rounded-lg border border-edge overflow-hidden">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-surface-page text-left">
            <Th>Name</Th>
            <Th>Score</Th>
            <Th>Signals</Th>
            <Th>Location</Th>
            <Th>Google</Th>
            <Th>Website</Th>
            <Th align="right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c) => (
            <tr
              key={c.id}
              className="border-t border-surface-alt hover:bg-surface-page transition-colors cursor-pointer"
              onClick={() => onOpen(c)}
            >
              <td className="px-3.5 py-2.5 text-ink font-semibold">{c.name}</td>
              <td className="px-3.5 py-2.5"><OpportunityBadge score={c.opportunity_score} /></td>
              <td className="px-3.5 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {(c.opportunity_signals || []).slice(0, 4).map((s) => (
                    <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-page border border-edge text-ink-muted">
                      {labelFor(s)}
                    </span>
                  ))}
                  {(c.opportunity_signals?.length ?? 0) > 4 && (
                    <span className="text-[10px] text-ink-faint">+{(c.opportunity_signals!.length - 4)} more</span>
                  )}
                </div>
              </td>
              <td className="px-3.5 py-2.5 text-ink-muted">
                {[c.city, c.state].filter(Boolean).join(', ') || '—'}
              </td>
              <td className="px-3.5 py-2.5 text-ink-muted tabular-nums">
                {c.google_rating != null ? `${c.google_rating} (${c.google_reviews_ct ?? 0})` : '—'}
              </td>
              <td className="px-3.5 py-2.5">
                {c.website ? (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-brand-mint hover:underline inline-flex items-center gap-1"
                  >
                    site <ExternalLink size={11} />
                  </a>
                ) : <span className="text-ink-faint">—</span>}
              </td>
              <td className="px-3.5 py-2.5 text-right">
                <div
                  className="flex justify-end items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => onReEnrich(c)}
                    disabled={reEnriching.has(c.id)}
                    title="Re-enrich (re-fetch website + recompute signals)"
                    className={cn(
                      'p-1 rounded text-ink-faint hover:text-brand-mint hover:bg-surface-page',
                      'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
                    )}
                  >
                    <RefreshCw size={13} className={reEnriching.has(c.id) ? 'animate-spin' : ''} />
                  </button>
                  <SecondaryButton
                    onClick={() => onPromote(c)}
                    className="px-2.5 py-1 text-xs"
                  >
                    Promote
                  </SecondaryButton>
                  <DangerButton onClick={() => onDismiss(c)}>
                    Dismiss
                  </DangerButton>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateDetailPanel({
  candidate, reEnriching, onClose, onPromote, onDismiss, onReEnrich,
}: {
  candidate: Candidate;
  reEnriching: boolean;
  onClose: () => void;
  onPromote: () => void;
  onDismiss: () => void;
  onReEnrich: () => void;
}) {
  const enr = (candidate.enrichment_data || {}) as Record<string, unknown>;
  const emails = (enr.extracted_emails as string[] | undefined) || [];
  const phones = (enr.extracted_phones as string[] | undefined) || [];
  const socials = (enr.social_platforms as string[] | undefined) || [];
  const trackers = (enr.ad_trackers as string[] | undefined) || [];

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute top-0 right-0 h-full w-[480px] bg-surface border-l border-edge shadow-2xl overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-edge">
          <div>
            <div className="text-[11px] text-ink-faint uppercase tracking-wider">Candidate</div>
            <h2 className="text-lg font-bold m-0">{candidate.name}</h2>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <OpportunityBadge score={candidate.opportunity_score} />
            <span className="text-[11px] text-ink-muted">via {candidate.source}</span>
          </div>

          <Section title="Opportunity signals">
            {(candidate.opportunity_signals?.length ?? 0) === 0 ? (
              <div className="text-[12px] text-ink-faint">None detected.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {candidate.opportunity_signals!.map((s) => (
                  <span key={s} className="text-[11px] px-2 py-0.5 rounded bg-warning-bg border border-warning-border text-warning">
                    {labelFor(s)}
                  </span>
                ))}
              </div>
            )}
          </Section>

          <Section title="Contact">
            <DL>
              <DT>Website</DT>
              <DD>
                {candidate.website ? (
                  <a href={candidate.website} target="_blank" rel="noreferrer noopener" className="text-brand-mint hover:underline inline-flex items-center gap-1">
                    {candidate.website} <ExternalLink size={11} />
                  </a>
                ) : <span className="text-ink-faint">—</span>}
              </DD>
              <DT>Phone</DT>
              <DD>{candidate.phone || '—'}</DD>
              <DT>Email</DT>
              <DD>{candidate.email || '—'}</DD>
              <DT>Address</DT>
              <DD>{[candidate.city, candidate.state].filter(Boolean).join(', ') || '—'}</DD>
            </DL>
          </Section>

          {(emails.length > 0 || phones.length > 0) && (
            <Section title="Extracted from website">
              {emails.length > 0 && (
                <div className="text-[12px] text-ink-muted mb-1">Emails: <span className="text-ink">{emails.join(', ')}</span></div>
              )}
              {phones.length > 0 && (
                <div className="text-[12px] text-ink-muted">Phones: <span className="text-ink">{phones.join(', ')}</span></div>
              )}
            </Section>
          )}

          <Section title="Marketing presence">
            <DL>
              <DT>Website quality</DT>
              <DD>{(enr.website_quality as string) || '—'}</DD>
              <DT>SEO</DT>
              <DD>{enr.has_seo ? <Up /> : <Down />}</DD>
              <DT>Social media</DT>
              <DD>{socials.length ? socials.join(', ') : <span className="text-ink-faint">none</span>}</DD>
              <DT>Paid ads</DT>
              <DD>{trackers.length ? trackers.join(', ') : <span className="text-ink-faint">none</span>}</DD>
              <DT>Google rating</DT>
              <DD>
                {candidate.google_rating != null
                  ? `${candidate.google_rating} (${candidate.google_reviews_ct ?? 0} reviews)`
                  : '—'}
              </DD>
            </DL>
          </Section>

          <div className="flex gap-2 pt-2 border-t border-edge">
            <PrimaryButton onClick={onPromote} className="flex-1">Promote to client</PrimaryButton>
            <SecondaryButton onClick={onReEnrich} disabled={reEnriching}>
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={12} className={reEnriching ? 'animate-spin' : ''} />
                {reEnriching ? 'Re-enriching…' : 'Re-enrich'}
              </span>
            </SecondaryButton>
            <DangerButton onClick={onDismiss}>Dismiss</DangerButton>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-ink-muted font-bold mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function DL({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 text-[12px]">{children}</dl>;
}
function DT({ children }: { children: React.ReactNode }) {
  return <dt className="text-ink-muted">{children}</dt>;
}
function DD({ children }: { children: React.ReactNode }) {
  return <dd className="text-ink m-0">{children}</dd>;
}
function Up() { return <ArrowUp size={12} className="text-success inline" />; }
function Down() { return <ArrowDown size={12} className="text-danger inline" />; }

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-3.5 py-2.5 text-[11px] font-semibold text-ink-muted uppercase tracking-wider',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {children}
    </th>
  );
}
