import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

function StatusBadge({ call }) {
  let label, bg, color, border;
  if (call.pushed_to_dashboard_at) {
    label = 'On Dashboard'; bg = '#E6FAF5'; color = '#00D4AA'; border = '#00D4AA';
  } else if (call.review_status === 'approved') {
    label = 'Approved'; bg = '#E6FAF5'; color = '#00D4AA'; border = '#00D4AA';
  } else if (call.review_status === 'pending') {
    label = 'Ready to review'; bg = '#FFF3E0'; color = '#E6A817'; border = '#E6A817';
  } else if (call.transcript) {
    label = 'Transcript'; bg = '#F7F8FA'; color = '#1B2838'; border = '#E2E6EB';
  } else if (call.audio_path) {
    label = 'Audio only'; bg = '#F7F8FA'; color = '#64748B'; border = '#E2E6EB';
  } else {
    label = 'Empty'; bg = '#F7F8FA'; color = '#94a3b8'; border = '#E2E6EB';
  }
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
      background: bg, color, border: `1px solid ${border}`,
    }}>
      {label}
    </span>
  );
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString();
}

function formatDuration(mins) {
  if (!mins) return '—';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Calls() {
  const [calls, setCalls] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Upload form state
  const [dealId, setDealId] = useState('');
  const [callDate, setCallDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [durationMinutes, setDurationMinutes] = useState('');
  const [audioFile, setAudioFile] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const [callsData, dealsData] = await Promise.all([api.getCalls(), api.getDeals()]);
      setCalls(callsData.calls || []);
      setDeals(dealsData.deals || []);
    } catch (err) {
      setError(err.message || 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setDealId(''); setCallDate(new Date().toISOString().slice(0, 10));
    setDurationMinutes(''); setAudioFile(null); setTranscript(''); setNotes('');
    setError(''); if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');

    if (!dealId) { setError('Select a deal'); return; }
    if (!audioFile && !transcript.trim()) { setError('Provide an audio file or paste a transcript'); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('deal_id', dealId);
      if (callDate) formData.append('call_date', callDate);
      if (durationMinutes) formData.append('duration_minutes', durationMinutes);
      if (audioFile) formData.append('audio', audioFile);
      if (transcript.trim()) formData.append('transcript', transcript.trim());
      if (notes.trim()) formData.append('notes', notes.trim());

      await api.createCall(formData);
      resetForm();
      setShowUpload(false);
      await load();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const deleteCall = async (id) => {
    if (!confirm('Delete this call recording? Audio file will be removed.')) return;
    try {
      await api.deleteCall(id);
      setCalls((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      alert(err.message || 'Delete failed');
    }
  };

  const dealLabel = (deal) => {
    const co = deal.company_name ? ` — ${deal.company_name}` : '';
    return `#${deal.id}${co} · ${deal.stage}`;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Call Recordings</h1>
        <button
          onClick={() => { setShowUpload((v) => !v); setError(''); }}
          style={{
            padding: '8px 16px', background: showUpload ? '#fff' : '#00D4AA',
            color: '#1B2838', border: showUpload ? '1px solid #E2E6EB' : 'none',
            borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showUpload ? 'Cancel' : '+ New Call'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#64748B', marginBottom: 20 }}>
        Upload audio from discovery calls (phone, Google Meet). Transcripts can be pasted now; automated Whisper transcription and Brand Profile extraction come next.
      </div>

      {showUpload && (
        <form
          onSubmit={handleUpload}
          style={{
            background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8,
            padding: 24, marginBottom: 20,
          }}
        >
          {error && (
            <div style={{
              background: '#FFF3E0', color: '#E6A817', border: '1px solid #E6A817',
              padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
                Deal <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <select
                value={dealId} onChange={(e) => setDealId(e.target.value)} required
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 14, background: '#fff', boxSizing: 'border-box',
                }}
              >
                <option value="">Select a deal…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{dealLabel(d)}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Call date</label>
              <input
                type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Duration (minutes)</label>
              <input
                type="number" min="0" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="e.g. 45"
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 14, boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Audio file</label>
              <input
                ref={fileInputRef} type="file"
                accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.aac,.flac"
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                style={{
                  width: '100%', padding: '6px 8px', border: '1px solid #E2E6EB',
                  borderRadius: 4, fontSize: 13, boxSizing: 'border-box', background: '#fff',
                }}
              />
              {audioFile && (
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                  {audioFile.name} — {formatFileSize(audioFile.size)}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>
              Transcript (optional — paste now, or leave blank for Whisper later)
            </label>
            <textarea
              rows={8} value={transcript} onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste the transcript here if you already have one (e.g. from Google Meet)…"
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
            <textarea
              rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context about this call…"
              style={{
                width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
                borderRadius: 4, fontSize: 13, fontFamily: 'inherit',
                resize: 'vertical', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit" disabled={uploading}
              style={{
                padding: '10px 20px', background: '#00D4AA', color: '#1B2838',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? 'Uploading…' : 'Save Call'}
            </button>
            <button
              type="button" onClick={() => { resetForm(); setShowUpload(false); }} disabled={uploading}
              style={{
                padding: '10px 16px', background: '#fff', color: '#1B2838',
                border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#64748B' }}>Loading calls…</div>
      ) : calls.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 40,
          textAlign: 'center', fontSize: 13, color: '#64748B',
        }}>
          No call recordings yet. Click <strong>+ New Call</strong> to upload one.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#1B2838', color: '#fff' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Call date</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Deal</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Duration</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Audio</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c, i) => (
                <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                  <td style={{ padding: '10px 16px', color: '#1B2838' }}>
                    {formatDate(c.call_date || c.created_at)}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    {c.deal_id ? (
                      <Link to={`/deals/${c.deal_id}`} style={{ color: '#1B2838', textDecoration: 'none' }}>
                        {c.company_name || `Deal #${c.deal_id}`}
                      </Link>
                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: '#64748B' }}>{formatDuration(c.duration_minutes)}</td>
                  <td style={{ padding: '10px 16px', color: '#64748B', fontSize: 12 }}>
                    {c.audio_original_name ? (
                      <span title={c.audio_original_name}>
                        {formatFileSize(c.audio_size_bytes)}
                      </span>
                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 16px' }}><StatusBadge call={c} /></td>
                  <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                    <Link
                      to={`/calls/${c.id}`}
                      style={{ color: '#00D4AA', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginRight: 12 }}
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => deleteCall(c.id)}
                      style={{
                        background: 'none', border: 'none', color: '#E6A817',
                        fontSize: 13, cursor: 'pointer', padding: 0,
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
