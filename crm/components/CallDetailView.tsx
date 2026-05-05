'use client';

// Call detail UI: transcript editor + audio playback + Brand Profile
// extraction button + Apply-to-client conflict diff modal.

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import ConflictDiffModal from './ConflictDiffModal';
import { ErrorBox, PrimaryButton, SecondaryButton } from './ui/Forms';
import { toast } from '@/lib/toast';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

type Choice = 'keep' | 'take' | 'skip';

export default function CallDetailView({ initialCall }: { initialCall: any }) {
  const [call, setCall] = useState<any>(initialCall);
  const [transcript, setTranscript] = useState(call.transcript || '');
  const [notes, setNotes] = useState(call.notes || '');
  const [dirty, setDirty] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');

  useEffect(() => {
    if (!call.audio_storage_path) return;
    api.get<{ url: string }>(`/api/calls/${call.id}/audio`)
      .then(({ url }) => setAudioUrl(url))
      .catch(() => {});
  }, [call.id, call.audio_storage_path]);

  const extraction = call.extracted_profile_json || null;

  async function saveTranscript() {
    setSavingTranscript(true);
    try {
      const { call: updated } = await api.patch<{ call: any }>(`/api/calls/${call.id}`, {
        transcript, notes,
      });
      setCall(updated);
      setDirty(false);
      toast.success('Transcript saved.');
    } catch (err: unknown) {
      toast.error(humanizeError(err, 'Failed to save transcript.'));
    } finally {
      setSavingTranscript(false);
    }
  }

  // Speaker rename
  const [speakerA, setSpeakerA] = useState('');
  const [speakerB, setSpeakerB] = useState('');
  const hasSpeakerLabels = /\bSpeaker [AB]:/.test(transcript);
  const renameValid = (n: string) => n.trim().length > 0 && !n.includes(':');

  function applySpeakerRename() {
    let next = transcript;
    if (renameValid(speakerA)) next = next.replaceAll('Speaker A:', `${speakerA.trim()}:`);
    if (renameValid(speakerB)) next = next.replaceAll('Speaker B:', `${speakerB.trim()}:`);
    if (next !== transcript) {
      setTranscript(next); setDirty(true);
      setSpeakerA(''); setSpeakerB('');
    }
  }

  async function extract() {
    setExtractError(''); setExtracting(true);
    try {
      if (dirty) await saveTranscript();
      const { extraction: result } = await api.post<{ extraction: any }>(`/api/calls/${call.id}/extract-brand-profile`);
      const fresh = await api.get<{ call: any }>(`/api/calls/${call.id}`);
      setCall(fresh.call);
      toast.success(`Extracted ${result.completion_percent || 0}% complete Brand Profile.`);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Extraction failed.');
      setExtractError(message);
      toast.error(message);
    } finally {
      setExtracting(false);
    }
  }

  // Apply-to-client diff modal
  const [conflicts, setConflicts] = useState<any[] | null>(null);
  const [conflictChoices, setConflictChoices] = useState<Record<string, Choice>>({});
  const [applying, setApplying] = useState(false);

  async function openApplyModal() {
    setExtractError('');
    try {
      const { conflicts: list } = await api.get<{ conflicts: any[] }>(
        `/api/calls/${call.id}/apply-to-client/preview`
      );
      if (!list || list.length === 0) {
        await commitApply({});
        return;
      }
      const defaults: Record<string, Choice> = {};
      for (const c of list) defaults[c.path] = 'take';
      setConflicts(list);
      setConflictChoices(defaults);
    } catch (err: unknown) {
      const message = humanizeError(err, 'Could not preview the apply.');
      setExtractError(message);
      toast.error(message);
    }
  }

  async function commitApply(choices: Record<string, Choice>) {
    setApplying(true);
    try {
      const result = await api.post<any>(`/api/calls/${call.id}/apply-to-client`, { choices });
      const applied = result.applied_paths?.length || 0;
      const merged = result.merged_paths?.length || 0;
      const skipped = result.skipped_paths?.length || 0;
      const parts: string[] = [];
      if (applied) parts.push(`${applied} updated`);
      if (merged) parts.push(`${merged} merged`);
      if (skipped) parts.push(`${skipped} preserved`);
      toast.success(`Applied to client — ${parts.join(', ') || 'no changes'}.`);
      setConflicts(null);
      setConflictChoices({});
    } catch (err: unknown) {
      const message = humanizeError(err, 'Apply failed.');
      setExtractError(message);
      toast.error(message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <header className="mt-3 mb-5">
        <h1 className="text-[22px] font-bold m-0">
          Call —{' '}
          {call.client_id ? (
            <Link href={`/clients/${call.client_id}`} className="text-brand-mint hover:underline">
              {call.client_name || `Client #${call.client_id}`}
            </Link>
          ) : 'Unknown client'}
        </h1>
        <div className="text-[13px] text-ink-muted mt-1">
          {call.call_date ? new Date(call.call_date).toLocaleString() : new Date(call.created_at).toLocaleString()}
          {call.duration_minutes && ` · ${call.duration_minutes} min`}
        </div>
      </header>

      <div className="grid grid-cols-[2fr_1fr] gap-5">
        <div className={panelClass}>
          <PanelTitle>
            Transcript
            <span className="text-[11px] text-ink-muted ml-3 font-normal">
              {call.transcript_source ? `Source: ${call.transcript_source}` : 'No transcript yet'}
              {transcript && ` · ${transcript.trim().split(/\s+/).length} words`}
            </span>
          </PanelTitle>

          {hasSpeakerLabels && (
            <div className="flex items-center gap-2 mb-2.5 px-2.5 py-2 bg-surface-page border border-edge rounded">
              <span className="text-[11px] text-ink-muted font-semibold">Rename:</span>
              <span className="text-[11px] text-ink-faint">A →</span>
              <input
                value={speakerA}
                onChange={(e) => setSpeakerA(e.target.value)}
                placeholder="e.g. Josh"
                className="w-[110px] px-2 py-1 border border-edge rounded text-xs"
              />
              <span className="text-[11px] text-ink-faint">B →</span>
              <input
                value={speakerB}
                onChange={(e) => setSpeakerB(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-[110px] px-2 py-1 border border-edge rounded text-xs"
              />
              <button
                onClick={applySpeakerRename}
                disabled={!(renameValid(speakerA) || renameValid(speakerB))}
                className={cn(
                  'px-3 py-1 rounded text-xs font-semibold border-none',
                  (renameValid(speakerA) || renameValid(speakerB))
                    ? 'bg-brand-charcoal text-white cursor-pointer hover:bg-ink'
                    : 'bg-edge text-ink-faint cursor-not-allowed',
                )}
              >
                Apply rename
              </button>
            </div>
          )}

          <textarea
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setDirty(true); }}
            placeholder="Paste the call transcript here. Then click 'Extract Brand Profile' on the right."
            rows={20}
            className="w-full px-3 py-2.5 border border-edge rounded text-[13px] font-sans resize-y leading-relaxed focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
          />
          <div className="mt-3">
            <label className="block text-[13px] text-ink-muted mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              rows={2}
              className="w-full px-2.5 py-2 border border-edge rounded text-[13px] font-sans resize-y focus:border-brand-mint focus:ring-1 focus:ring-brand-mint focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3 mt-3">
            <PrimaryButton onClick={saveTranscript} disabled={!dirty || savingTranscript}>
              {savingTranscript ? 'Saving…' : 'Save transcript'}
            </PrimaryButton>
            {dirty && <span className="text-xs text-ink-muted">Unsaved changes</span>}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {call.audio_storage_path && (
            <div className={panelClass}>
              <PanelTitle>Audio</PanelTitle>
              <div className="text-xs text-ink break-all mb-2">
                {call.audio_original_name}
              </div>
              {audioUrl && <audio controls src={audioUrl} className="w-full" />}
            </div>
          )}

          <div className={panelClass}>
            <PanelTitle>Brand Profile extraction</PanelTitle>
            {extractError && <ErrorBox>{extractError}</ErrorBox>}
            {!extraction && !transcript.trim() && (
              <div className="text-xs text-ink-faint mb-2.5">
                Paste a transcript first, then extract.
              </div>
            )}
            {extraction && (
              <div className="mb-2.5 text-xs text-ink-muted">
                <div>{extraction.completion_percent}% complete</div>
                <div>Extracted {new Date(extraction.extracted_at).toLocaleString()}</div>
                <div>Review: {call.review_status}</div>
              </div>
            )}
            <PrimaryButton
              onClick={extract}
              disabled={extracting || !transcript.trim()}
              className="w-full"
            >
              {extracting ? 'Extracting…' : extraction ? 'Re-extract' : 'Extract Brand Profile'}
            </PrimaryButton>
            {extraction && (
              <SecondaryButton
                onClick={openApplyModal}
                disabled={applying || dirty}
                title={dirty ? 'Save your transcript edits first' : ''}
                className="mt-2 w-full"
              >
                {applying ? 'Applying…' : 'Apply to client'}
              </SecondaryButton>
            )}
          </div>

          <div className={panelClass}>
            <PanelTitle>Metadata</PanelTitle>
            <div className="text-xs text-ink-muted leading-loose">
              <div>Created: {new Date(call.created_at).toLocaleString()}</div>
              <div>Updated: {new Date(call.updated_at).toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      {conflicts && conflicts.length > 0 && (
        <ConflictDiffModal
          conflicts={conflicts}
          choices={conflictChoices}
          onChoiceChange={(path, val) => setConflictChoices({ ...conflictChoices, [path]: val })}
          onCancel={() => { setConflicts(null); setConflictChoices({}); }}
          onConfirm={() => commitApply(conflictChoices)}
          applying={applying}
        />
      )}
    </div>
  );
}

const panelClass = 'bg-surface border border-edge rounded-lg p-4';

function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-bold mt-0 mb-3">{children}</h3>;
}
