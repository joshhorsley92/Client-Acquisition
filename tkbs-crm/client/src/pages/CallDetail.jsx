import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import BrandProfileEditor from '../components/BrandProfileEditor';

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Minimum fields we want populated for a "complete" Brand Profile.
function computeCompletion(profile) {
  if (!profile) return 0;
  const checks = [
    !!profile.business_name,
    !!profile.industry,
    !!profile.customer_avatar?.name,
    (profile.customer_avatar?.pain_points?.length || 0) > 0,
    (profile.brand_personality?.traits?.length || 0) > 0,
    !!profile.visual_identity?.primary_color,
    (profile.brand_voice?.tone?.length || 0) > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function CallDetail() {
  const { id } = useParams();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Transcript + notes
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [transcriptDirty, setTranscriptDirty] = useState(false);

  // Brand Profile extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extraction, setExtraction] = useState(null); // full payload from server
  const [originalProfile, setOriginalProfile] = useState(null); // for dirty detection
  const [editedProfile, setEditedProfile] = useState(null);
  const [editedFieldsSet, setEditedFieldsSet] = useState([]);
  const [excludedFields, setExcludedFields] = useState([]);

  // Re-extract confirmation modal
  const [confirmReExtract, setConfirmReExtract] = useState(false);

  // Save/approve state
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');

  // Whisper transcription state
  const [transcribeError, setTranscribeError] = useState('');
  const [requestingTranscribe, setRequestingTranscribe] = useState(false);

  // Computed flags derived from `call` and `transcript`. Declared up here
  // (rather than alongside the polling effect) so they're in scope for the
  // speaker-rename helpers below.
  const transcribing = call?.transcript_status === 'pending' || call?.transcript_status === 'processing';
  const hasSpeakerLabels = /\bSpeaker [AB]:/.test(transcript);

  // Speaker rename — only relevant when transcript has Speaker A: / B: markers
  const [speakerA, setSpeakerA] = useState('');
  const [speakerB, setSpeakerB] = useState('');

  const renameValid = (name) => name.trim().length > 0 && !name.includes(':');
  const canApplyRename =
    hasSpeakerLabels &&
    !transcribing &&
    ((renameValid(speakerA) && transcript.includes('Speaker A:')) ||
     (renameValid(speakerB) && transcript.includes('Speaker B:')));

  const applySpeakerRename = () => {
    let next = transcript;
    if (renameValid(speakerA)) next = next.replaceAll('Speaker A:', `${speakerA.trim()}:`);
    if (renameValid(speakerB)) next = next.replaceAll('Speaker B:', `${speakerB.trim()}:`);
    if (next !== transcript) {
      setTranscript(next);
      setTranscriptDirty(true);
      setSpeakerA('');
      setSpeakerB('');
    }
  };

  // Load call
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCall(id)
      .then((d) => {
        if (cancelled) return;
        setCall(d.call);
        setTranscript(d.call.transcript || '');
        setNotes(d.call.notes || '');
        setTranscriptDirty(false);
        loadExtractionFromCall(d.call);
      })
      .catch((err) => setError(err.message || 'Failed to load call'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  // Poll while Whisper is running. Stops as soon as the row leaves
  // pending/processing or the user starts editing the transcript locally.
  // (`transcribing` is declared above with the other derived flags.)
  useEffect(() => {
    if (!transcribing) return;
    if (transcriptDirty) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await api.getCall(id);
        if (cancelled) return;
        setCall(fresh.call);
        if (fresh.call.transcript_status === 'done' && fresh.call.transcript && !transcriptDirty) {
          setTranscript(fresh.call.transcript);
        }
      } catch { /* keep polling */ }
    };
    const handle = setInterval(tick, 3000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [id, transcribing, transcriptDirty]);

  function loadExtractionFromCall(callRow) {
    if (!callRow?.extracted_profile_json) {
      setExtraction(null);
      setOriginalProfile(null);
      setEditedProfile(null);
      setEditedFieldsSet([]);
      setExcludedFields([]);
      return;
    }
    try {
      const payload = JSON.parse(callRow.extracted_profile_json);
      setExtraction(payload);
      setOriginalProfile(payload.profile || null);
      setEditedProfile(payload.profile ? JSON.parse(JSON.stringify(payload.profile)) : null);
      setEditedFieldsSet(payload.edited_fields || []);
      setExcludedFields(payload.excluded_fields || []);
    } catch { /* ignore */ }
  }

  const profileDirty = useMemo(() => {
    if (!editedProfile || !originalProfile) return false;
    if (!deepEqual(editedProfile, originalProfile)) return true;
    const storedEdited = extraction?.edited_fields || [];
    const storedExcluded = extraction?.excluded_fields || [];
    return !deepEqual(editedFieldsSet, storedEdited) || !deepEqual(excludedFields, storedExcluded);
  }, [editedProfile, originalProfile, editedFieldsSet, excludedFields, extraction]);

  const liveCompletion = useMemo(() => {
    // Only count non-excluded fields toward completion — matches what will push
    if (!editedProfile) return 0;
    // For simplicity, completion calc uses the raw profile regardless of exclusion;
    // exclusion is about what gets pushed, not about how "complete" it looks.
    return computeCompletion(editedProfile);
  }, [editedProfile]);

  const isApproved = call?.review_status === 'approved' && !profileDirty;

  const requestTranscribe = async () => {
    setTranscribeError(''); setRequestingTranscribe(true);
    try {
      const { call: updated } = await api.transcribeCall(id);
      setCall(updated);
    } catch (err) {
      setTranscribeError(err.message || 'Failed to start transcription');
    } finally {
      setRequestingTranscribe(false);
    }
  };

  const saveTranscript = async () => {
    setSavingTranscript(true); setSavedMessage('');
    try {
      const updated = await api.updateCall(id, { transcript, notes });
      setCall(updated.call);
      setTranscriptDirty(false);
      setSavedMessage('Saved');
      setTimeout(() => setSavedMessage(''), 2000);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSavingTranscript(false);
    }
  };

  const runExtraction = async () => {
    setExtractError(''); setExtracting(true);
    try {
      if (transcriptDirty) {
        await api.updateCall(id, { transcript, notes });
        setTranscriptDirty(false);
      }
      const { extraction: result } = await api.extractBrandProfile(id);
      const fresh = await api.getCall(id);
      setCall(fresh.call);
      // Re-extraction always resets edits/exclusions — this is the overwrite path
      setExtraction(result);
      setOriginalProfile(result.profile || null);
      setEditedProfile(result.profile ? JSON.parse(JSON.stringify(result.profile)) : null);
      setEditedFieldsSet([]);
      setExcludedFields([]);
    } catch (err) {
      setExtractError(err.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractClick = () => {
    // If there's already an extraction (even if unedited), confirm before overwriting.
    if (extraction) {
      setConfirmReExtract(true);
    } else {
      runExtraction();
    }
  };

  const handleProfileChange = (newProfile, changedPath, newExcluded) => {
    if (newProfile !== undefined) setEditedProfile(newProfile);
    if (newExcluded !== undefined) setExcludedFields(newExcluded);
    if (changedPath && !editedFieldsSet.includes(changedPath)) {
      setEditedFieldsSet([...editedFieldsSet, changedPath]);
    }
  };

  const saveProfile = async () => {
    setProfileError(''); setSavingProfile(true);
    try {
      const payload = {
        ...extraction,
        profile: editedProfile,
        edited_fields: editedFieldsSet,
        excluded_fields: excludedFields,
        completion_percent: liveCompletion,
      };
      // If user edited anything after approval, clear the approval timestamp
      if (profileDirty && extraction?.reviewed_at) {
        payload.reviewed_at = null;
        payload.reviewed_by = null;
      }
      const updated = await api.updateCall(id, {
        extracted_profile_json: JSON.stringify(payload),
        // Demote back to pending if user edits an approved profile
        review_status: call?.review_status === 'approved' ? 'pending' : call?.review_status,
      });
      setCall(updated.call);
      loadExtractionFromCall(updated.call);
      setSavedMessage('Changes saved');
      setTimeout(() => setSavedMessage(''), 2000);
    } catch (err) {
      setProfileError(err.message || 'Save failed');
    } finally {
      setSavingProfile(false);
    }
  };

  const approveProfile = async () => {
    setProfileError(''); setSavingProfile(true);
    try {
      const payload = {
        ...extraction,
        profile: editedProfile,
        edited_fields: editedFieldsSet,
        excluded_fields: excludedFields,
        completion_percent: liveCompletion,
        reviewed_at: new Date().toISOString(),
      };
      const updated = await api.updateCall(id, {
        extracted_profile_json: JSON.stringify(payload),
        review_status: 'approved',
      });
      setCall(updated.call);
      loadExtractionFromCall(updated.call);
      setSavedMessage('Approved — profile is now available to the Automations flow.');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      setProfileError(err.message || 'Approve failed');
    } finally {
      setSavingProfile(false);
    }
  };

  // Apply-to-client diff modal state
  const [conflicts, setConflicts] = useState(null); // null = not previewing, [] = none, [...] = conflicts
  const [conflictChoices, setConflictChoices] = useState({}); // { path: 'keep'|'take'|'skip' }
  const [applying, setApplying] = useState(false);

  const applyToClient = async () => {
    setProfileError('');
    try {
      const { conflicts: list } = await api.previewApplyToClient(id);
      if (!list || list.length === 0) {
        // No conflicts — apply immediately, no modal needed
        await commitApply({});
        return;
      }
      // Default each conflict to "take" (the existing behavior). User can override.
      const defaults = {};
      for (const c of list) defaults[c.path] = 'take';
      setConflicts(list);
      setConflictChoices(defaults);
    } catch (err) {
      setProfileError(err.message || 'Apply failed');
    }
  };

  const commitApply = async (choices) => {
    setApplying(true);
    try {
      const result = await api.applyCallToClient(id, { choices });
      const applied = result.applied_paths?.length || 0;
      const merged = result.merged_paths?.length || 0;
      const skipped = result.skipped_paths?.length || 0;
      const parts = [];
      if (applied) parts.push(`${applied} updated`);
      if (merged) parts.push(`${merged} merged`);
      if (skipped) parts.push(`${skipped} preserved`);
      setSavedMessage(`Applied to client — ${parts.join(', ') || 'no changes'}.`);
      setTimeout(() => setSavedMessage(''), 4000);
      setConflicts(null);
      setConflictChoices({});
    } catch (err) {
      setProfileError(err.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, fontSize: 13, color: '#64748B' }}>Loading…</div>;
  }
  if (error && !call) {
    return (
      <div>
        <Link to="/calls" style={{ color: '#00D4AA', fontSize: 13, textDecoration: 'none' }}>← Back to calls</Link>
        <div style={{
          background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
          padding: '8px 12px', borderRadius: 4, fontSize: 13, marginTop: 16,
        }}>{error}</div>
      </div>
    );
  }
  if (!call) return null;

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  return (
    <div>
      <Link to="/calls" style={{ color: '#00D4AA', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
        ← Back to calls
      </Link>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginTop: 12, marginBottom: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Call — {call.client_name || `Client #${call.client_id}`}
          </h1>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>
            {formatDate(call.call_date || call.created_at)}
            {call.duration_minutes ? ` · ${call.duration_minutes} min` : ''}
          </div>
        </div>
        {call.client_id && (
          <Link
            to={`/clients/${call.client_id}`}
            style={{
              padding: '8px 14px', background: '#fff', color: '#1B2838',
              border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}
          >
            Open client →
          </Link>
        )}
      </div>

      {/* Top row: transcript + sidebar (audio + extraction trigger) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Transcript</h3>
            <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 8 }}>
              {transcribing && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                  background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
                }}>
                  {call.transcript_status === 'processing' ? 'Transcribing…' : 'Queued'}
                </span>
              )}
              {call.transcript_status === 'failed' && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                  background: '#FEE2E2', color: '#dc2626', border: '1px solid #dc2626',
                }}>
                  Transcription failed
                </span>
              )}
              <span>
                {call.transcript_source ? `Source: ${call.transcript_source}` : 'No transcript yet'}
                {wordCount > 0 && ` · ${wordCount} words`}
              </span>
            </div>
          </div>

          {call.transcript_status === 'failed' && call.transcript_error && (
            <div style={{
              background: '#FEE2E2', color: '#dc2626', border: '1px solid #dc2626',
              padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
            }}>
              {call.transcript_error}
            </div>
          )}

          {transcribeError && (
            <div style={{
              background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
              padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
            }}>
              {transcribeError}
            </div>
          )}

          {hasSpeakerLabels && !transcribing && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '8px 10px', background: '#F7F8FA',
              border: '1px solid #E2E6EB', borderRadius: 4,
            }}>
              <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>Rename:</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>A →</span>
              <input
                type="text"
                value={speakerA}
                onChange={(e) => setSpeakerA(e.target.value)}
                placeholder="e.g. Josh"
                style={{
                  width: 110, padding: '4px 8px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 12,
                }}
              />
              <span style={{ fontSize: 11, color: '#94a3b8' }}>B →</span>
              <input
                type="text"
                value={speakerB}
                onChange={(e) => setSpeakerB(e.target.value)}
                placeholder="e.g. Sarah"
                style={{
                  width: 110, padding: '4px 8px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 12,
                }}
              />
              <button
                onClick={applySpeakerRename}
                disabled={!canApplyRename}
                title={canApplyRename ? 'Replaces Speaker A:/B: in the transcript with the names you entered.' : 'Enter at least one valid name (no colons).'}
                style={{
                  padding: '5px 12px', background: canApplyRename ? '#1B2838' : '#E2E6EB',
                  color: canApplyRename ? '#fff' : '#94a3b8', border: 'none', borderRadius: 4,
                  fontSize: 12, fontWeight: 600,
                  cursor: canApplyRename ? 'pointer' : 'not-allowed',
                }}
              >
                Apply rename
              </button>
              <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                Save transcript to persist
              </span>
            </div>
          )}

          <textarea
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setTranscriptDirty(true); }}
            placeholder={
              transcribing
                ? 'Whisper is transcribing this call — sit tight, this usually takes under a minute.'
                : call.audio_path
                  ? 'No transcript yet. Paste one here, or click Transcribe to run Whisper on the audio.'
                  : 'No transcript yet. Paste one here.'
            }
            rows={18}
            disabled={transcribing}
            style={{
              width: '100%', padding: '10px 12px', border: '1px solid #E2E6EB',
              borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
              resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5,
              background: transcribing ? '#F7F8FA' : '#fff',
              cursor: transcribing ? 'wait' : 'text',
            }}
          />

          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setTranscriptDirty(true); }}
              rows={2}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button
              onClick={saveTranscript} disabled={!transcriptDirty || savingTranscript || transcribing}
              style={{
                padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: (!transcriptDirty || savingTranscript || transcribing) ? 'not-allowed' : 'pointer',
                opacity: (!transcriptDirty || savingTranscript || transcribing) ? 0.6 : 1,
              }}
            >
              {savingTranscript ? 'Saving…' : 'Save transcript'}
            </button>
            {call.audio_path && (
              <button
                onClick={requestTranscribe}
                disabled={requestingTranscribe || transcribing || transcriptDirty}
                className={transcribing ? 'tkbs-busy' : undefined}
                title={
                  transcriptDirty
                    ? 'Save your edits first — Whisper will overwrite the transcript.'
                    : call.transcript
                      ? 'Re-run Whisper. This will overwrite the current transcript.'
                      : 'Run Whisper on the uploaded audio.'
                }
                style={{
                  padding: '8px 16px',
                  background: transcribing ? '#E6A817' : '#fff',
                  color: transcribing ? '#fff' : '#1B2838',
                  border: transcribing ? 'none' : '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 13, fontWeight: 600,
                  cursor: (requestingTranscribe || transcribing || transcriptDirty) ? 'not-allowed' : 'pointer',
                  opacity: transcribing ? 1 : ((requestingTranscribe || transcriptDirty) ? 0.6 : 1),
                }}
              >
                {transcribing
                  ? 'Transcribing…'
                  : call.transcript_status === 'failed'
                    ? 'Retry transcription'
                    : call.transcript
                      ? 'Re-transcribe'
                      : 'Transcribe with Whisper'}
              </button>
            )}
            {savedMessage && (
              <span style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600 }}>{savedMessage}</span>
            )}
            {transcriptDirty && !savedMessage && (
              <span style={{ fontSize: 12, color: '#64748B' }}>Unsaved changes</span>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Audio</h3>
            {call.audio_path ? (
              <>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>File</div>
                <div style={{ fontSize: 13, color: '#1B2838', marginBottom: 8, wordBreak: 'break-all' }}>
                  {call.audio_original_name || 'audio file'}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
                  {formatFileSize(call.audio_size_bytes)}
                </div>
                <audio controls src={`/api/calls/${call.id}/audio`} style={{ width: '100%', marginBottom: 8 }} />
                <a
                  href={`/api/calls/${call.id}/audio`} download
                  style={{
                    display: 'inline-block', padding: '6px 12px', background: '#fff',
                    color: '#1B2838', border: '1px solid #E2E6EB', borderRadius: 4,
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >Download</a>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No audio file attached.</div>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Brand Profile extraction</h3>

            {extractError && (
              <div style={{
                background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
                padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 10,
              }}>{extractError}</div>
            )}

            {!extraction && !transcript.trim() && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Paste a transcript first, then extract.
              </div>
            )}

            {extraction && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                    background: '#E6FAF5', color: '#00D4AA', border: '1px solid #00D4AA',
                  }}>
                    {liveCompletion}% complete
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {extraction.model?.split('-').slice(0, 3).join('-') || 'Claude'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                  Extracted {formatDate(extraction.extracted_at)}
                  {extraction.usage && ` · ${extraction.usage.input_tokens?.toLocaleString()} in / ${extraction.usage.output_tokens?.toLocaleString()} out`}
                </div>

                <div style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 10, fontWeight: 600,
                  display: 'inline-block',
                  background: isApproved ? '#E6FAF5' : call?.review_status === 'pending' ? '#FFF3E0' : '#F7F8FA',
                  color: isApproved ? '#00D4AA' : call?.review_status === 'pending' ? '#E6A817' : '#94a3b8',
                  border: `1px solid ${isApproved ? '#00D4AA' : call?.review_status === 'pending' ? '#E6A817' : '#E2E6EB'}`,
                }}>
                  {isApproved ? 'Approved' : call?.review_status === 'pending' ? 'Pending review' : 'Not reviewed'}
                </div>
              </div>
            )}

            <button
              onClick={handleExtractClick}
              disabled={extracting || !transcript.trim()}
              className={extracting ? 'tkbs-busy' : undefined}
              style={{
                width: '100%', padding: '8px 12px',
                background: extracting ? '#00D4AA' : extraction ? '#fff' : '#00D4AA',
                color: '#1B2838',
                border: extracting ? 'none' : extraction ? '1px solid #E2E6EB' : 'none',
                borderRadius: 4, fontSize: 13, fontWeight: 600,
                cursor: (extracting || !transcript.trim()) ? 'not-allowed' : 'pointer',
                opacity: extracting ? 1 : (!transcript.trim() ? 0.6 : 1),
              }}
            >
              {extracting ? 'Extracting…' : extraction ? 'Re-extract' : 'Extract Brand Profile'}
            </button>
            {extracting && (
              <div style={{ marginTop: 8 }}>
                <div className="tkbs-bar-track">
                  <div className="tkbs-bar-fill" />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                  Asking Claude to synthesize the brand profile — usually 5–15 seconds.
                </div>
              </div>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Metadata</h3>
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.8 }}>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Created:</strong> {formatDate(call.created_at)}</div>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Updated:</strong> {formatDate(call.updated_at)}</div>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Review:</strong> {call.review_status}</div>
              {extraction?.reviewed_at && (
                <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Approved:</strong> {formatDate(extraction.reviewed_at)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width Brand Profile editor */}
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 12,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Brand Profile</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {profileError && (
              <span style={{ fontSize: 12, color: '#dc2626' }}>{profileError}</span>
            )}
            {profileDirty && (
              <span style={{ fontSize: 12, color: '#E6A817', fontWeight: 600 }}>
                Unsaved changes {isApproved ? '' : ''}
              </span>
            )}
            {isApproved && !profileDirty && (
              <span style={{
                fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                background: '#E6FAF5', color: '#00D4AA', border: '1px solid #00D4AA',
              }}>
                Approved
              </span>
            )}

            {extraction && (
              <>
                <button
                  onClick={saveProfile}
                  disabled={!profileDirty || savingProfile}
                  style={{
                    padding: '8px 16px', background: '#fff', color: '#1B2838',
                    border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13,
                    fontWeight: 600,
                    cursor: (!profileDirty || savingProfile) ? 'not-allowed' : 'pointer',
                    opacity: (!profileDirty || savingProfile) ? 0.6 : 1,
                  }}
                >
                  {savingProfile ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  onClick={approveProfile}
                  disabled={savingProfile || isApproved}
                  style={{
                    padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
                    border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                    cursor: (savingProfile || isApproved) ? 'not-allowed' : 'pointer',
                    opacity: (savingProfile || isApproved) ? 0.6 : 1,
                  }}
                  title="Approve marks the extraction as reviewed."
                >
                  {isApproved ? 'Approved' : 'Approve & mark ready'}
                </button>
                <button
                  onClick={applyToClient}
                  disabled={savingProfile || profileDirty || applying}
                  style={{
                    padding: '8px 16px', background: '#1B2838', color: '#00D4AA',
                    border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                    cursor: (savingProfile || profileDirty || applying) ? 'not-allowed' : 'pointer',
                    opacity: (savingProfile || profileDirty || applying) ? 0.6 : 1,
                  }}
                  title={profileDirty ? 'Save your edits first, then apply.' : 'Merge this extraction into the client\u2019s canonical Brand Profile. Manual edits on the client are preserved.'}
                >
                  {applying ? 'Applying…' : 'Apply to client'}
                </button>
              </>
            )}
          </div>
        </div>

        <BrandProfileEditor
          profile={editedProfile}
          sidecar={extraction?.sidecar}
          excludedFields={excludedFields}
          onChange={handleProfileChange}
          disabled={savingProfile}
        />
      </div>

      {/* Re-extract confirmation modal */}
      {confirmReExtract && (
        <div
          onClick={() => setConfirmReExtract(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, padding: 24, width: 440,
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px 0' }}>Re-extract Brand Profile?</h3>
            <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, margin: '0 0 20px 0' }}>
              {profileDirty
                ? 'This will replace your edits with a fresh Claude extraction. Your current changes will be lost.'
                : 'This will overwrite the existing extraction with a fresh one. Rejected fields and prior approvals will also be reset.'}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmReExtract(false)}
                style={{
                  padding: '8px 16px', background: '#fff', color: '#1B2838',
                  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={() => { setConfirmReExtract(false); runExtraction(); }}
                style={{
                  padding: '8px 16px', background: '#E6A817', color: '#fff',
                  border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Re-extract anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* Apply-to-Client conflict diff modal */}
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

// Modal that surfaces every per-path conflict between the client's current
// Brand Profile and the call's incoming extraction. User picks keep / take /
// skip per field; choices are POSTed to /apply-to-client.
function ConflictDiffModal({ conflicts, choices, onChoiceChange, onCancel, onConfirm, applying }) {
  const labelize = (path) => path.replace(/_/g, ' ').replace(/\./g, ' › ');
  const renderValue = (v) => {
    if (v == null) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (Array.isArray(v)) return <span>{v.join(', ')}</span>;
    return <span>{String(v)}</span>;
  };
  const sourceHint = (src) => {
    if (!src) return null;
    if (src === 'manual') return <span style={{ color: '#A16207', fontWeight: 600 }}>your edit</span>;
    if (src.startsWith('call:')) return <span style={{ color: '#64748B' }}>from call #{src.split(':')[1]}</span>;
    if (src.startsWith('merged:')) return <span style={{ color: '#64748B' }}>merged from call #{src.split(':')[1]}</span>;
    return <span style={{ color: '#64748B' }}>{src}</span>;
  };

  return (
    <div
      onClick={applying ? undefined : onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 8, padding: 24, width: 720,
          maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px 0' }}>
          Resolve conflicts before applying
        </h3>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, margin: '0 0 18px 0' }}>
          {conflicts.length} field{conflicts.length === 1 ? '' : 's'} on this client already
          {' '}have a value that disagrees with the new extraction. Pick what to do for each.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {conflicts.map((c) => (
            <div key={c.path} style={{
              border: '1px solid #E2E6EB', borderRadius: 6, padding: 12,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1B2838', marginBottom: 8 }}>
                {labelize(c.path)}
                {c.current_source && (
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 8 }}>
                    ({sourceHint(c.current_source)})
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                <div style={{
                  padding: 8, background: '#F7F8FA', borderRadius: 4,
                  fontSize: 12, color: '#1B2838',
                }}>
                  <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>Current</div>
                  {renderValue(c.current)}
                </div>
                <div style={{
                  padding: 8, background: '#E6FAF5', borderRadius: 4,
                  fontSize: 12, color: '#1B2838',
                }}>
                  <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>From this call</div>
                  {renderValue(c.incoming)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <ChoicePill
                  label="Keep current"
                  active={choices[c.path] === 'keep'}
                  onClick={() => onChoiceChange(c.path, 'keep')}
                  hint="Lock as your edit; future calls won't overwrite"
                />
                <ChoicePill
                  label="Take new"
                  active={choices[c.path] === 'take'}
                  onClick={() => onChoiceChange(c.path, 'take')}
                  hint="Overwrite with the call's value"
                />
                <ChoicePill
                  label="Skip"
                  active={choices[c.path] === 'skip'}
                  onClick={() => onChoiceChange(c.path, 'skip')}
                  hint="Don't change anything for this field"
                />
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, gap: 8 }}>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Tip: array fields like pain points always merge — they never conflict.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              disabled={applying}
              style={{
                padding: '8px 16px', background: '#fff', color: '#1B2838',
                border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600,
                cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.6 : 1,
              }}
            >Cancel</button>
            <button
              onClick={onConfirm}
              disabled={applying}
              style={{
                padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
                cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.6 : 1,
              }}
            >{applying ? 'Applying…' : 'Apply with these choices'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChoicePill({ label, active, onClick, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      style={{
        padding: '5px 12px', fontSize: 12, fontWeight: 600,
        borderRadius: 14,
        border: `1px solid ${active ? '#00D4AA' : '#E2E6EB'}`,
        background: active ? '#E6FAF5' : '#fff',
        color: active ? '#047857' : '#64748B',
        cursor: 'pointer',
      }}
    >
      {active ? '✓ ' : ''}{label}
    </button>
  );
}
