'use client';

// New Call modal. Required: client + (transcript OR audio file). If audio
// is uploaded, it goes to Supabase Storage via a signed URL first, then
// the metadata is POSTed to /api/calls.

import { useState, FormEvent } from 'react';
import Modal from './Modal';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase-browser';

export default function NewCallModal({
  open, onClose, onCreated, clients, defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (call: any) => void;
  clients: Array<{ id: number; name: string }>;
  defaultClientId?: number;
}) {
  const [clientId, setClientId] = useState<string>(defaultClientId ? String(defaultClientId) : '');
  const [callDate, setCallDate] = useState('');
  const [duration, setDuration] = useState('');
  const [transcript, setTranscript] = useState('');
  const [notes, setNotes] = useState('');
  const [audio, setAudio] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleClose = () => {
    if (submitting) return;
    setClientId(defaultClientId ? String(defaultClientId) : '');
    setCallDate(''); setDuration(''); setTranscript(''); setNotes('');
    setAudio(null); setError('');
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) { setError('Pick a client'); return; }
    if (!transcript.trim() && !audio) { setError('Provide a transcript or upload audio'); return; }
    setError(''); setSubmitting(true);
    try {
      let audio_storage_path: string | null = null;
      let audio_original_name: string | null = null;
      let audio_size_bytes: number | null = null;

      if (audio) {
        // 1. Get a signed upload URL from the API
        const { token, path } = await api.post<{ token: string; path: string }>('/api/calls/upload-url', { filename: audio.name });
        // 2. Upload directly to Supabase Storage
        const { error: upErr } = await supabase.storage
          .from('crm-call-recordings')
          .uploadToSignedUrl(path, token, audio);
        if (upErr) throw new Error(`Audio upload failed: ${upErr.message}`);
        audio_storage_path = path;
        audio_original_name = audio.name;
        audio_size_bytes = audio.size;
      }

      const { call } = await api.post<{ call: any }>('/api/calls', {
        client_id: Number(clientId),
        call_date: callDate || null,
        duration_minutes: duration ? Number(duration) : null,
        transcript: transcript || null,
        notes: notes || null,
        audio_storage_path, audio_original_name, audio_size_bytes,
      });
      onCreated(call);
    } catch (err: any) {
      setError(err.message || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Call" width={520}>
      {error && <div style={errorBox}>{error}</div>}
      <form onSubmit={submit}>
        <Field label="Client" required>
          <select style={input} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">— select client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Row>
          <Field label="Call date">
            <input type="date" style={input} value={callDate} onChange={(e) => setCallDate(e.target.value)} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" style={input} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
        </Row>
        <Field label="Audio file (optional)">
          <input
            type="file"
            accept="audio/*,video/*,.mp3,.m4a,.wav,.ogg,.webm,.mp4,.mov,.aac,.flac"
            onChange={(e) => setAudio(e.target.files?.[0] || null)}
            style={{ fontSize: 13 }}
          />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
            Stored in Supabase. Whisper auto-transcription is paused for v1.0 — paste the transcript below.
          </div>
        </Field>
        <Field label="Transcript">
          <textarea
            style={{ ...input, minHeight: 140, resize: 'vertical', fontFamily: 'inherit' }}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the call transcript here, then run Brand Profile extraction from the call detail page."
          />
        </Field>
        <Field label="Notes">
          <textarea
            style={{ ...input, minHeight: 60, resize: 'vertical', fontFamily: 'inherit' }}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={handleClose} disabled={submitting} style={secondary}>Cancel</button>
          <button
            type="submit"
            disabled={submitting || !clientId || (!transcript.trim() && !audio)}
            style={primary(submitting || !clientId || (!transcript.trim() && !audio))}
          >
            {submitting ? 'Creating…' : 'Add call'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}
function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid #E2E6EB',
  borderRadius: 4, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit',
};
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 12,
};
const primary = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838', border: 'none',
  borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const secondary: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
};
