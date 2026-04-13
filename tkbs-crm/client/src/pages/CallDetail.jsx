import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

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

// Compact read-only preview of the extracted Brand Profile in the sidebar.
// Full editing UI comes in Stage 4 (Review & approve).
function ExtractionPreview({ profile, sidecar }) {
  if (!profile) return null;

  const scalarField = (label, value, path) => {
    const side = sidecar?.[path];
    const hasValue = value !== null && value !== undefined && value !== '';
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 12, color: hasValue ? '#1B2838' : '#94a3b8' }}>
          {hasValue ? value : '—'}
          {side?.confidence != null && hasValue && (
            <span style={{ marginLeft: 6, color: '#94a3b8', fontSize: 10 }}>
              ({Math.round(side.confidence * 100)}%)
            </span>
          )}
        </div>
      </div>
    );
  };

  const arrayField = (label, value) => {
    const items = Array.isArray(value) ? value : [];
    return (
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 2 }}>{label}</div>
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: '#94a3b8' }}>—</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {items.map((item, i) => (
              <span key={i} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                background: '#F7F8FA', color: '#1B2838', border: '1px solid #E2E6EB',
              }}>
                {item}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const section = (title, children) => (
    <details style={{ marginBottom: 12 }} open>
      <summary style={{
        fontSize: 12, fontWeight: 700, color: '#1B2838', cursor: 'pointer',
        padding: '6px 0', borderBottom: '1px solid #F7F8FA', marginBottom: 8,
      }}>
        {title}
      </summary>
      <div style={{ paddingLeft: 4 }}>{children}</div>
    </details>
  );

  return (
    <div>
      {section('Business Identity', (
        <>
          {scalarField('Business name', profile.business_name, 'business_name')}
          {scalarField('Industry', profile.industry, 'industry')}
          {scalarField('Description', profile.business_description, 'business_description')}
          {scalarField('Website', profile.website_url, 'website_url')}
          {scalarField('Location', [profile.location_city, profile.location_state].filter(Boolean).join(', '), 'location_city')}
          {scalarField('Years in business', profile.years_in_business, 'years_in_business')}
        </>
      ))}

      {section('Customer Avatar', (
        <>
          {scalarField('Name', profile.customer_avatar?.name, 'customer_avatar.name')}
          {scalarField('Age range', profile.customer_avatar?.age_range, 'customer_avatar.age_range')}
          {scalarField('Occupation', profile.customer_avatar?.occupation, 'customer_avatar.occupation')}
          {arrayField('Pain points', profile.customer_avatar?.pain_points)}
          {arrayField('Goals', profile.customer_avatar?.goals)}
          {arrayField('Objections', profile.customer_avatar?.objections)}
        </>
      ))}

      {section('Brand Personality', (
        <>
          {arrayField('Traits', profile.brand_personality?.traits)}
          {scalarField('Mood', profile.brand_personality?.mood, 'brand_personality.mood')}
          {scalarField('Formality', profile.brand_personality?.formality_level, 'brand_personality.formality_level')}
        </>
      ))}

      {section('Visual Identity', (
        <>
          {scalarField('Primary color', profile.visual_identity?.primary_color, 'visual_identity.primary_color')}
          {scalarField('Heading font', profile.visual_identity?.heading_font, 'visual_identity.heading_font')}
          {arrayField('Style keywords', profile.visual_identity?.style_keywords)}
        </>
      ))}

      {section('Brand Voice', (
        <>
          {arrayField('Tone', profile.brand_voice?.tone)}
          {arrayField('Do', profile.brand_voice?.dos)}
          {arrayField("Don't", profile.brand_voice?.donts)}
          {scalarField('Tagline', profile.brand_voice?.tagline, 'brand_voice.tagline')}
        </>
      ))}
    </div>
  );
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editable fields
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  // Brand Profile extraction
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extraction, setExtraction] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCall(id)
      .then((d) => {
        if (cancelled) return;
        setCall(d.call);
        setTranscript(d.call.transcript || '');
        setNotes(d.call.notes || '');
        setDirty(false);
        // Parse cached extraction if present
        if (d.call.extracted_profile_json) {
          try {
            setExtraction(JSON.parse(d.call.extracted_profile_json));
          } catch { /* ignore parse errors */ }
        } else {
          setExtraction(null);
        }
      })
      .catch((err) => setError(err.message || 'Failed to load call'))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [id]);

  const extractBrandProfile = async () => {
    setExtractError(''); setExtracting(true);
    try {
      // If the user has unsaved transcript edits, save first so extraction uses them
      if (dirty) {
        await api.updateCall(id, { transcript, notes });
        setDirty(false);
      }
      const { extraction: result } = await api.extractBrandProfile(id);
      setExtraction(result);
      // Refresh call to pick up review_status change
      const fresh = await api.getCall(id);
      setCall(fresh.call);
    } catch (err) {
      setExtractError(err.message || 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const save = async () => {
    setSaving(true); setSavedMessage('');
    try {
      const updated = await api.updateCall(id, { transcript, notes });
      setCall(updated.call);
      setDirty(false);
      setSavedMessage('Saved');
      setTimeout(() => setSavedMessage(''), 2000);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
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

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        {/* Transcript */}
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
            onChange={(e) => { setTranscript(e.target.value); setDirty(true); }}
            placeholder="No transcript yet. Paste one here, or wait for Whisper auto-transcription (coming soon)."
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
              rows={3}
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <button
              onClick={save} disabled={!dirty || saving}
              style={{
                padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
                opacity: (!dirty || saving) ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {savedMessage && (
              <span style={{ fontSize: 12, color: '#00D4AA', fontWeight: 600 }}>{savedMessage}</span>
            )}
            {dirty && !savedMessage && (
              <span style={{ fontSize: 12, color: '#64748B' }}>Unsaved changes</span>
            )}
          </div>
        </div>

        {/* Sidebar — audio + metadata */}
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
                <audio
                  controls
                  src={`/api/calls/${call.id}/audio`}
                  style={{ width: '100%', marginBottom: 8 }}
                />
                <a
                  href={`/api/calls/${call.id}/audio`}
                  download
                  style={{
                    display: 'inline-block', padding: '6px 12px', background: '#fff',
                    color: '#1B2838', border: '1px solid #E2E6EB', borderRadius: 4,
                    fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  }}
                >
                  Download
                </a>
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
              }}>
                {extractError}
              </div>
            )}

            {!extraction && !transcript.trim() && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                Paste a transcript first, then extract.
              </div>
            )}

            {!extraction && transcript.trim() && (
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
                Claude will read the transcript and extract a Brand Profile matching the TKBS Dashboard schema.
              </div>
            )}

            {extraction && (
              <div style={{ marginBottom: 10 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 11, padding: '2px 10px', borderRadius: 10, fontWeight: 600,
                    background: '#E6FAF5', color: '#00D4AA', border: '1px solid #00D4AA',
                  }}>
                    {extraction.completion_percent}% complete
                  </span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>
                    {extraction.model?.split('-').slice(0, 3).join('-') || 'Claude'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                  Extracted {formatDate(extraction.extracted_at)}
                  {extraction.usage && ` · ${extraction.usage.input_tokens?.toLocaleString()} in / ${extraction.usage.output_tokens?.toLocaleString()} out tokens`}
                </div>
              </div>
            )}

            <button
              onClick={extractBrandProfile}
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

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
              Review UI for editing + pushing to Dashboard is the next stage.
            </div>
          </div>

          {extraction && (
            <div style={{
              background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
              padding: 16, marginBottom: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Extracted fields</h3>
              <ExtractionPreview profile={extraction.profile} sidecar={extraction.sidecar} />
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>Metadata</h3>
            <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.8 }}>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Created:</strong> {formatDate(call.created_at)}</div>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Updated:</strong> {formatDate(call.updated_at)}</div>
              <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Review:</strong> {call.review_status}</div>
              {call.pushed_to_dashboard_at && (
                <div><strong style={{ color: '#1B2838', fontWeight: 600 }}>Pushed:</strong> {formatDate(call.pushed_to_dashboard_at)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
