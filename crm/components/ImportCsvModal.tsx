'use client';

// CSV import modal — file picker, header preview, run, result panel.
// Mirrors the prototype behavior; file goes to POST /api/import-clients
// (multipart) which streams it through csv-parse server-side.

import { useState, useRef } from 'react';
import Modal from './Modal';
import { api } from '@/lib/api';

const REQUIRED_HEADER = 'name';
const KNOWN_COLUMNS = [
  'name', 'website', 'industry', 'location', 'type',
  'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
  'notes', 'source_platform', 'source_url', 'source_lead_id',
];

interface Preview {
  headers: string[];
  rows: string[][];
  hasName: boolean;
  unknownColumns: string[];
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
  skipped_details?: Array<{ row: number; reason: string }>;
  clients: any[];
}

export default function ImportCsvModal({
  open, onClose, onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: (res: ImportResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setPreview(null); setPreviewError('');
    setSubmitting(false); setResult(null); setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    setError('');
    if (!f) { setPreview(null); return; }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
        if (lines.length === 0) { setPreviewError('File is empty.'); setPreview(null); return; }
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const rows = lines.slice(1, 6).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
        setPreview({
          headers, rows,
          hasName: headers.includes(REQUIRED_HEADER),
          unknownColumns: headers.filter((h) => h && !KNOWN_COLUMNS.includes(h)),
        });
        setPreviewError('');
      } catch (err: any) {
        setPreviewError(`Could not preview: ${err.message}`);
        setPreview(null);
      }
    };
    reader.readAsText(f);
  };

  const submit = async () => {
    if (!file) return;
    setSubmitting(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.postForm<ImportResult>('/api/import-clients', fd);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Import Clients from CSV" width={620}>
      {!result && (
        <>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
            Upload a CSV with one row per client. <strong>name</strong> is required;
            everything else is optional. Already-imported leads (matched by{' '}
            <code style={code}>source_lead_id</code> or{' '}
            <code style={code}>name+email</code>) are skipped automatically.
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              style={{ fontSize: 13 }}
            />
          </div>

          {previewError && <div style={errorBox}>{previewError}</div>}

          {preview && (
            <div style={{ marginBottom: 14 }}>
              {!preview.hasName && (
                <div style={errorBox}>
                  Missing required column <strong>name</strong>. The first row of the CSV is the header.
                </div>
              )}
              {preview.unknownColumns.length > 0 && (
                <div style={{ ...errorBox, background: '#FFF8E6', color: '#A16207', borderColor: '#FCD34D' }}>
                  Ignored columns: {preview.unknownColumns.join(', ')}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6 }}>
                Preview ({preview.rows.length} of first 5 rows)
              </div>
              <div style={{ overflow: 'auto', border: '1px solid #E2E6EB', borderRadius: 4 }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>{preview.headers.map((h, i) => (
                      <th key={i} style={cellHead(KNOWN_COLUMNS.includes(h))}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={cell$}>{cell || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <div style={errorBox}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={handleClose} disabled={submitting} style={secondaryBtn}>Cancel</button>
            <button
              onClick={submit}
              disabled={!file || submitting || (preview && !preview.hasName) === true}
              style={primaryBtn(!file || submitting || (preview && !preview.hasName) === true)}
            >
              {submitting ? 'Importing…' : 'Import clients'}
            </button>
          </div>
        </>
      )}

      {result && (
        <ImportResultView
          result={result}
          onClose={() => { reset(); onCompleted(result); }}
          onAnother={() => reset()}
        />
      )}
    </Modal>
  );
}

function ImportResultView({ result, onClose, onAnother }: { result: ImportResult; onClose: () => void; onAnother: () => void }) {
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
        padding: 10, background: '#F7F8FA', borderRadius: 6, marginBottom: 14,
      }}>
        <Stat label="Imported" value={result.imported} accent="#00D4AA" />
        <Stat label="Skipped" value={result.skipped} accent="#64748B" />
        <Stat label="Errors" value={result.errors?.length || 0} accent={(result.errors?.length || 0) > 0 ? '#dc2626' : '#94a3b8'} />
      </div>
      {result.errors?.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
            {result.errors.length} error{result.errors.length === 1 ? '' : 's'} — click to view
          </summary>
          <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#1B2838' }}>
            {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
          </ul>
        </details>
      )}
      {result.skipped_details && result.skipped_details.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
            {result.skipped_details.length} skipped — click to view
          </summary>
          <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#64748B' }}>
            {result.skipped_details.map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}
          </ul>
        </details>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onAnother} style={secondaryBtn}>Import another</button>
        <button onClick={onClose} style={primaryBtn(false)}>Close</button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, color: '#64748B' }}>{label}</div>
    </div>
  );
}

const code: React.CSSProperties = { background: '#F7F8FA', padding: '1px 5px', borderRadius: 3, fontSize: 12, fontFamily: 'monospace' };
const errorBox: React.CSSProperties = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 10,
};
const secondaryBtn: React.CSSProperties = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
  border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const cellHead = (known: boolean): React.CSSProperties => ({
  padding: '6px 10px', background: known ? '#E6FAF5' : '#FFF8E6',
  color: known ? '#047857' : '#A16207',
  fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #E2E6EB',
});
const cell$: React.CSSProperties = {
  padding: '4px 10px', borderBottom: '1px solid #F3F4F6', maxWidth: 160,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
