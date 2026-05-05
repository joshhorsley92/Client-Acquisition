'use client';

// Call detail UI: transcript editor + audio playback + Brand Profile
// extraction button + Apply-to-client conflict diff modal.
//
// Whisper status row + retry button are intentionally omitted — v1.0
// has no auto-transcription (paste manually).

import { useState, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import ConflictDiffModal from './ConflictDiffModal';

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
  const [savedMessage, setSavedMessage] = useState('');

  // Fetch a signed audio URL on mount if there's an audio file
  useEffect(() => {
    if (!call.audio_storage_path) return;
    api.get<{ url: string }>(`/api/calls/${call.id}/audio`)
      .then(({ url }) => setAudioUrl(url))
      .catch(() => {});
  }, [call.id, call.audio_storage_path]);

  const extraction = call.extracted_profile_json || null;

  // ----- Save transcript / notes -----
  async function saveTranscript() {
    setSavingTranscript(true); setSavedMessage('');
    try {
      const { call: updated } = await api.patch<{ call: any }>(`/api/calls/${call.id}`, {
        transcript, notes,
      });
      setCall(updated);
      setDirty(false);
      setSavedMessage('Saved');
      setTimeout(() => setSavedMessage(''), 2000);
    } catch (err: any) {
      setSavedMessage(`Error: ${err.message}`);
    } finally {
      setSavingTranscript(false);
    }
  }

  // ----- Speaker rename -----
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

  // ----- Extract Brand Profile -----
  async function extract() {
    setExtractError(''); setExtracting(true);
    try {
      // Save any pending transcript edits first
      if (dirty) await saveTranscript();
      const { extraction: result } = await api.post<{ extraction: any }>(`/api/calls/${call.id}/extract-brand-profile`);
      const fresh = await api.get<{ call: any }>(`/api/calls/${call.id}`);
      setCall(fresh.call);
      setSavedMessage(`Extracted ${result.completion_percent || 0}% complete profile`);
      setTimeout(() => setSavedMessage(''), 4000);
    } catch (err: any) {
      setExtractError(err.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }

  // ----- Apply-to-client diff modal -----
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
    } catch (err: any) {
      setExtractError(err.message || 'Apply failed');
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
      setSavedMessage(`Applied to client — ${parts.join(', ') || 'no changes'}`);
      setTimeout(() => setSavedMessage(''), 4000);
      setConflicts(null);
      setConflictChoices({});
    } catch (err: any) {
      setExtractError(err.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <header style={{ marginTop: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Call —{' '}
          {call.client_id ? (
            <Link href={`/clients/${call.client_id}`} style={{ color: '#00D4AA' }}>
              {call.client_name || `Client #${call.client_id}`}
            </Link>
          ) : 'Unknown client'}
        </h1>
        <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
          {call.call_date ? new Date(call.call_date).toLocaleString() : new Date(call.created_at).toLocaleString()}
          {call.duration_minutes && ` · ${call.duration_minutes} min`}
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Left column: transcript + notes */}
        <div style={panel}>
          <PanelTitle>
            Transcript
            <span style={{ fontSize: 11, color: '#64748B', marginLeft: 12 }}>
              {call.transcript_source ? `Source: ${call.transcript_source}` : 'No transcript yet'}
              {transcript && ` · ${transcript.trim().split(/\s+/).length} words`}
            </span>
          </PanelTitle>

          {hasSpeakerLabels && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 10px', background: '#F7F8FA',
              border: '1px solid #E2E6EB', borderRadius: 4,
            }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Rename:</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>A →</span>
              <input value={speakerA} onChange={(e) => setSpeakerA(e.target.value)} placeholder="e.g. Josh"
                style={renameInputStyle} />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>B →</span>
              <input value={speakerB} onChange={(e) => setSpeakerB(e.target.value)} placeholder="e.g. Sarah"
                style={renameInputStyle} />
              <button onClick={applySpeakerRename}
                disabled={!(renameValid(speakerA) || renameValid(speakerB))}
                style={renameBtn(!(renameValid(speakerA) || renameValid(speakerB)))}>
                Apply rename
              </button>
            </div>
          )}

          <textarea
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setDirty(true); }}
            placeholder="Paste the call transcript here. Then click 'Extract Brand Profile' on the right."
            rows={20}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
            }}
          />
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <button onClick={saveTranscript} disabled={!dirty || savingTranscript} style={primaryBtn(!dirty || savingTranscript)}>
              {savingTranscript ? 'Saving…' : 'Save transcript'}
            </button>
            {savedMessage && (
              <span style={{ fontSize: 12, color: savedMessage.startsWith('Error') ? '#dc2626' : '#047857', fontWeight: 600 }}>
                {savedMessage}
              </span>
            )}
            {dirty && !savedMessage && <span style={{ fontSize: 12, color: '#64748B' }}>Unsaved changes</span>}
          </div>
        </div>

        {/* Right column: audio + extraction */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {call.audio_storage_path && (
            <div style={panel}>
              <PanelTitle>Audio</PanelTitle>
              <div style={{ fontSize: 12, color: '#1B2838', wordBreak: 'break-all', marginBottom: 8 }}>
                {call.audio_original_name}
              </div>
              {audioUrl && <audio controls src={audioUrl} style={{ width: '100%' }} />}
            </div>
          )}

          <div style={panel}>
            <PanelTitle>Brand Profile extraction</PanelTitle>
            {extractError && <div style={errorBox}>{extractError}</div>}
            {!extraction && !transcript.trim() && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Paste a transcript first, then extract.
              </div>
            )}
            {extraction && (
              <div style={{ marginBottom: 10, fontSize: 12, color: '#64748B' }}>
                <div>{extraction.completion_percent}% complete</div>
                <div>Extracted {new Date(extraction.extracted_at).toLocaleString()}</div>
                <div>Review: {call.review_status}</div>
              </div>
            )}
            <button
              onClick={extract}
              disabled={extracting || !transcript.trim()}
              style={primaryBtn(extracting || !transcript.trim())}
            >
              {extracting ? 'Extracting…' : extraction ? 'Re-extract' : 'Extract Brand Profile'}
            </button>
            {extraction && (
              <button
                onClick={openApplyModal}
                disabled={applying || dirty}
                style={{ ...secondaryBtn, marginTop: 8, width: '100%' }}
                title={dirty ? 'Save your transcript edits first' : ''}
              >
                {applying ? 'Applying…' : 'Apply to client'}
              </button>
            )}
          </div>

          <div style={panel}>
            <PanelTitle>Metadata</PanelTitle>
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.7 }}>
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

const panel: React.CSSProperties = {
  background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16,
};
function PanelTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>{children}</h3>;
}
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 10,
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
const renameInputStyle: React.CSSProperties = {
  width: 110, padding: '4px 8px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 12,
};
const renameBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '5px 12px', background: disabled ? '#E2E6EB' : '#1B2838',
  color: disabled ? '#94a3b8' : '#fff', border: 'none', borderRadius: 4,
  fontSize: 12, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
});
