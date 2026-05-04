import React, { useState, useRef } from 'react';
import Modal from './Modal';
import { api } from '../lib/api';

// Bulk-import clients from a CSV file. Renders:
//   - File picker + raw header preview (first 5 rows)
//   - "Import" button → POSTs to /api/import-clients
//   - Result summary: imported / skipped / errors with details
//
// Mirrors the FindNewClientsModal lifecycle: parent controls open/close,
// fires onCompleted() so the Clients list can refresh.

const REQUIRED_HEADER = 'name';
const KNOWN_COLUMNS = [
  'name', 'website', 'industry', 'location', 'type',
  'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
  'notes', 'source_platform', 'source_url', 'source_lead_id',
];

export default function ImportCsvModal({ open, onClose, onCompleted }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // { headers, rows, hasName }
  const [previewError, setPreviewError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    setFile(f || null);
    setResult(null);
    setError('');
    if (!f) { setPreview(null); return; }
    // Lightweight client-side preview (first 6 lines, comma-split). Not a
    // real CSV parser — just to spot header issues before committing.
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 6);
        if (lines.length === 0) {
          setPreviewError('File is empty.');
          setPreview(null);
          return;
        }
        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
        const rows = lines.slice(1, 6).map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
        setPreview({
          headers,
          rows,
          hasName: headers.includes(REQUIRED_HEADER),
          unknownColumns: headers.filter((h) => h && !KNOWN_COLUMNS.includes(h)),
        });
        setPreviewError('');
      } catch (err) {
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
      const res = await api.importClientsCsv(fd);
      setResult(res);
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Import Clients from CSV">
      {!result && (
        <>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
            Upload a CSV with one row per client. The <strong>name</strong> column is required;
            everything else is optional. Already-imported leads (matched by{' '}
            <code style={codeStyle}>source_lead_id</code> or{' '}
            <code style={codeStyle}>name+email</code>) are skipped automatically.
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

          {previewError && (
            <div style={errorBoxStyle}>{previewError}</div>
          )}

          {preview && (
            <div style={{ marginBottom: 14 }}>
              {!preview.hasName && (
                <div style={errorBoxStyle}>
                  Missing required column <strong>name</strong>. The first row of the CSV is the header.
                </div>
              )}
              {preview.unknownColumns.length > 0 && (
                <div style={{ ...errorBoxStyle, background: '#FFF8E6', color: '#A16207', borderColor: '#FCD34D' }}>
                  These columns will be ignored: {preview.unknownColumns.join(', ')}.
                </div>
              )}
              <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginBottom: 6 }}>
                Preview ({preview.rows.length} of first 5 rows)
              </div>
              <div style={{ overflow: 'auto', border: '1px solid #E2E6EB', borderRadius: 4 }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {preview.headers.map((h, i) => (
                        <th key={i} style={cellHeadStyle(KNOWN_COLUMNS.includes(h))}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={cellStyle}>{cell || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <div style={errorBoxStyle}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={handleClose} disabled={submitting} style={btnSecondaryStyle}>Cancel</button>
            <button
              onClick={submit}
              disabled={!file || submitting || (preview && !preview.hasName)}
              style={btnPrimaryStyle((!file || submitting || (preview && !preview.hasName)))}
            >
              {submitting ? 'Importing…' : 'Import clients'}
            </button>
          </div>
        </>
      )}

      {result && (
        <ImportResult
          result={result}
          onClose={() => { reset(); onCompleted && onCompleted(); }}
          onImportAnother={() => reset()}
        />
      )}
    </Modal>
  );
}

function ImportResult({ result, onClose, onImportAnother }) {
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

      {result.errors && result.errors.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>
            {result.errors.length} error{result.errors.length === 1 ? '' : 's'} — click to view
          </summary>
          <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#1B2838' }}>
            {result.errors.map((e, i) => (
              <li key={i}>Row {e.row}: {e.reason}</li>
            ))}
          </ul>
        </details>
      )}

      {result.skipped_details && result.skipped_details.length > 0 && (
        <details style={{ marginBottom: 12 }}>
          <summary style={{ fontSize: 12, color: '#64748B', cursor: 'pointer' }}>
            {result.skipped_details.length} skipped — click to view
          </summary>
          <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#64748B' }}>
            {result.skipped_details.map((s, i) => (
              <li key={i}>Row {s.row}: {s.reason}</li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onImportAnother} style={btnSecondaryStyle}>Import another</button>
        <button onClick={onClose} style={btnPrimaryStyle(false)}>Close</button>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent }}>{value ?? 0}</div>
      <div style={{ fontSize: 11, color: '#64748B' }}>{label}</div>
    </div>
  );
}

const codeStyle = {
  background: '#F7F8FA', padding: '1px 5px', borderRadius: 3, fontSize: 12, fontFamily: 'monospace',
};
const errorBoxStyle = {
  background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991b1b',
  padding: '8px 12px', borderRadius: 4, fontSize: 12, marginBottom: 10,
};
const btnSecondaryStyle = {
  padding: '8px 16px', background: '#fff', color: '#1B2838',
  border: '1px solid #E2E6EB', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const btnPrimaryStyle = (disabled) => ({
  padding: '8px 16px', background: '#00D4AA', color: '#1B2838',
  border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
});
const cellHeadStyle = (known) => ({
  padding: '6px 10px', background: known ? '#E6FAF5' : '#FFF8E6',
  color: known ? '#047857' : '#A16207',
  fontWeight: 600, textAlign: 'left', borderBottom: '1px solid #E2E6EB',
});
const cellStyle = {
  padding: '4px 10px', borderBottom: '1px solid #F3F4F6', maxWidth: 160,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};
