'use client';

// CSV import modal — file picker, header preview, run, result panel.
// CSV is a multipart upload (not a JSON payload), so this stays a manual
// form rather than wiring up react-hook-form.

import { useState, useRef } from 'react';
import Modal from './Modal';
import { ErrorBox, PrimaryButton, SecondaryButton } from './ui/Forms';
import { api } from '@/lib/api';
import { humanizeError } from '@/lib/humanize-error';
import { cn } from '@/lib/cn';

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
      } catch (err: unknown) {
        setPreviewError(humanizeError(err, 'Could not preview the file.'));
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
    } catch (err: unknown) {
      setError(humanizeError(err, 'Import failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import Clients from CSV"
      width={620}
    >
      {!result && (
        <>
          <div className="text-[13px] text-ink-muted mb-3.5 leading-relaxed">
            Upload a CSV with one row per client. <strong>name</strong> is required;
            everything else is optional. Already-imported leads (matched by{' '}
            <code className="bg-surface-page px-1.5 py-px rounded text-xs font-mono">source_lead_id</code> or{' '}
            <code className="bg-surface-page px-1.5 py-px rounded text-xs font-mono">name+email</code>) are skipped automatically.
          </div>

          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="text-[13px]"
            />
          </div>

          {previewError && <ErrorBox>{previewError}</ErrorBox>}

          {preview && (
            <div className="mb-3.5">
              {!preview.hasName && (
                <ErrorBox>
                  Missing required column <strong>name</strong>. The first row of the CSV is the header.
                </ErrorBox>
              )}
              {preview.unknownColumns.length > 0 && (
                <div className="bg-warning-bg text-warning border border-warning-border px-3 py-2 rounded text-xs mb-3">
                  Ignored columns: {preview.unknownColumns.join(', ')}
                </div>
              )}
              <div className="text-[11px] text-ink-muted font-semibold mb-1.5">
                Preview ({preview.rows.length} of first 5 rows)
              </div>
              <div className="overflow-auto border border-edge rounded">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr>{preview.headers.map((h, i) => (
                      <th
                        key={i}
                        className={cn(
                          'px-2.5 py-1.5 font-semibold text-left border-b border-edge',
                          KNOWN_COLUMNS.includes(h)
                            ? 'bg-success-bg text-success'
                            : 'bg-warning-bg text-warning',
                        )}
                      >
                        {h}
                      </th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-2.5 py-1 border-b border-surface-alt max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap"
                          >
                            {cell || <span className="text-ink-faint">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}

          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={handleClose} disabled={submitting}>Cancel</SecondaryButton>
            <PrimaryButton
              onClick={submit}
              disabled={!file || submitting || (preview ? !preview.hasName : false)}
            >
              {submitting ? 'Importing…' : 'Import clients'}
            </PrimaryButton>
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
      <div className="grid grid-cols-3 gap-2 p-2.5 bg-surface-page rounded-md mb-3.5">
        <Stat label="Imported" value={result.imported} tone="success" />
        <Stat label="Skipped" value={result.skipped} tone="muted" />
        <Stat
          label="Errors"
          value={result.errors?.length || 0}
          tone={(result.errors?.length || 0) > 0 ? 'danger' : 'muted'}
        />
      </div>
      {result.errors?.length > 0 && (
        <details className="mb-3">
          <summary className="text-xs text-danger cursor-pointer font-semibold">
            {result.errors.length} error{result.errors.length === 1 ? '' : 's'} — click to view
          </summary>
          <ul className="mt-2 ml-4 text-xs text-ink list-disc">
            {result.errors.map((e, i) => <li key={i}>Row {e.row}: {e.reason}</li>)}
          </ul>
        </details>
      )}
      {result.skipped_details && result.skipped_details.length > 0 && (
        <details className="mb-3">
          <summary className="text-xs text-ink-muted cursor-pointer">
            {result.skipped_details.length} skipped — click to view
          </summary>
          <ul className="mt-2 ml-4 text-xs text-ink-muted list-disc">
            {result.skipped_details.map((s, i) => <li key={i}>Row {s.row}: {s.reason}</li>)}
          </ul>
        </details>
      )}
      <div className="flex justify-end gap-2">
        <SecondaryButton onClick={onAnother}>Import another</SecondaryButton>
        <PrimaryButton onClick={onClose}>Close</PrimaryButton>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'success' | 'muted' | 'danger' }) {
  const valueClass =
    tone === 'success' ? 'text-brand-mint' :
    tone === 'danger' ? 'text-danger' :
    'text-ink-muted';
  return (
    <div className="text-center">
      <div className={cn('text-2xl font-bold', valueClass)}>{value ?? 0}</div>
      <div className="text-[11px] text-ink-muted">{label}</div>
    </div>
  );
}
