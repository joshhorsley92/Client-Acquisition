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

// Minimum required fields per the Dashboard schema.
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
      setSavedMessage('Approved — ready for Dashboard push (coming in Stage 4b)');
      setTimeout(() => setSavedMessage(''), 3000);
    } catch (err) {
      setProfileError(err.message || 'Approve failed');
    } finally {
      setSavingProfile(false);
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
            Call — {call.company_name || `Deal #${call.deal_id}`}
          </h1>
          <div style={{ fontSize: 13, color: '#64748B', marginTop: 6 }}>
            {formatDate(call.call_date || call.created_at)}
            {call.duration_minutes ? ` · ${call.duration_minutes} min` : ''}
          </div>
        </div>
        {call.deal_id && (
          <Link
            to={`/deals/${call.deal_id}`}
            style={{
              padding: '8px 14px', background: '#fff', color: '#1B2838',
              border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
            }}
          >
            Open deal →
          </Link>
        )}
      </div>

      {/* Top row: transcript + sidebar (audio + extraction trigger) */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Transcript</h3>
            <div style={{ fontSize: 11, color: '#64748B' }}>
              {call.transcript_source ? `Source: ${call.transcript_source}` : 'No transcript yet'}
              {wordCount > 0 && ` · ${wordCount} words`}
            </div>
          </div>

          <textarea
            value={transcript}
            onChange={(e) => { setTranscript(e.target.value); setTranscriptDirty(true); }}
            placeholder="No transcript yet. Paste one here, or wait for Whisper auto-transcription (coming soon)."
            rows={18}
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
              onClick={saveTranscript} disabled={!transcriptDirty || savingTranscript}
              style={{
                padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: (!transcriptDirty || savingTranscript) ? 'not-allowed' : 'pointer',
                opacity: (!transcriptDirty || savingTranscript) ? 0.6 : 1,
              }}
            >
              {savingTranscript ? 'Saving…' : 'Save transcript'}
            </button>
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
              style={{
                width: '100%', padding: '8px 12px',
                background: extraction ? '#fff' : '#00D4AA',
                color: '#1B2838',
                border: extraction ? '1px solid #E2E6EB' : 'none',
                borderRadius: 4, fontSize: 13, fontWeight: 600,
                cursor: (extracting || !transcript.trim()) ? 'not-allowed' : 'pointer',
                opacity: (extracting || !transcript.trim()) ? 0.6 : 1,
              }}
            >
              {extracting ? 'Extracting…' : extraction ? 'Re-extract' : '✨ Extract Brand Profile'}
            </button>
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
              {call.pushed_to_dashboard_at && (
                <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Pushed:</strong> {formatDate(call.pushed_to_dashboard_at)}</div>
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
                ✓ Approved
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
                >
                  {isApproved ? 'Approved ✓' : 'Approve & mark ready'}
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
    </div>
  );
}
