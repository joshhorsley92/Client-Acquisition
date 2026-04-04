import React, { useState } from 'react';
import { api } from '../lib/api';

const STAGES = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'lead', label: 'Lead' },
];

const SOURCES = [
  { id: 'cold', label: 'Cold' },
  { id: 'referral', label: 'Referral' },
  { id: 'web', label: 'Web' },
  { id: 'content', label: 'Content' },
  { id: 'paid_ads', label: 'Paid Ads' },
];

const FIELD_HINTS = [
  'company_name / company / business',
  'contact_name / contact / name',
  'contact_email / email',
  'contact_phone / phone',
  'location / city',
  'industry',
  'type (B2B / B2C)',
  'website / url',
  'source',
  'notes / message',
];

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function mapRow(headers, values) {
  const row = {};
  headers.forEach((h, i) => { row[h.toLowerCase().trim()] = (values[i] || '').trim(); });
  return {
    company_name: row.company_name || row.company || row.business || '',
    contact_name: row.contact_name || row.contact || row.name || '',
    contact_email: row.contact_email || row.email || '',
    contact_phone: row.contact_phone || row.phone || '',
    location: row.location || row.city || '',
    industry: row.industry || '',
    type: row.type || '',
    website: row.website || row.url || '',
    source: row.source || '',
    notes: row.notes || row.message || '',
  };
}

function parseInput(raw) {
  const text = raw.trim();
  if (!text) return { prospects: [], error: 'Nothing to parse.' };

  // Try JSON first
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return { prospects: arr, error: null };
    } catch (e) {
      return { prospects: [], error: 'Invalid JSON: ' + e.message };
    }
  }

  // CSV
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { prospects: [], error: 'CSV needs at least a header row and one data row.' };

  const headers = parseCsvLine(lines[0]);
  const prospects = lines.slice(1).map((line) => mapRow(headers, parseCsvLine(line)));
  return { prospects, error: null };
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid #E2E6EB',
  borderRadius: 4,
  fontSize: 14,
  boxSizing: 'border-box',
  background: '#fff',
};

const labelStyle = { fontSize: 13, color: '#64748B', display: 'block', marginBottom: 4 };

const cardStyle = {
  background: '#fff',
  border: '1px solid #E2E6EB',
  borderRadius: 8,
  padding: 24,
  marginBottom: 24,
};

export default function Import() {
  const [activeTab, setActiveTab] = useState('paste');

  // Shared settings
  const [defaultStage, setDefaultStage] = useState('prospect');
  const [defaultSource, setDefaultSource] = useState('cold');

  // Paste/parse method
  const [rawInput, setRawInput] = useState('');
  const [previewProspects, setPreviewProspects] = useState([]);
  const [parseError, setParseError] = useState('');
  const [parsed, setParsed] = useState(false);

  // Manual method
  const [manualForm, setManualForm] = useState({
    company_name: '', contact_name: '', contact_email: '', contact_phone: '',
    location: '', industry: '', type: '', website: '',
  });
  const [manualList, setManualList] = useState([]);

  // Results
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const handleParse = () => {
    const { prospects, error } = parseInput(rawInput);
    if (error) {
      setParseError(error);
      setPreviewProspects([]);
      setParsed(false);
    } else {
      setParseError('');
      setPreviewProspects(prospects);
      setParsed(true);
    }
  };

  const handlePasteImport = async () => {
    if (previewProspects.length === 0) return;
    setImporting(true);
    setResults(null);
    try {
      const res = await api.request('/import/bulk', { method: 'POST', body: {
        prospects: previewProspects,
        default_stage: defaultStage,
        default_source: defaultSource,
      } });
      setResults(res);
      if (res.imported > 0) {
        setRawInput('');
        setPreviewProspects([]);
        setParsed(false);
      }
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleManualAdd = () => {
    if (!manualForm.company_name && !manualForm.contact_name) {
      alert('Enter at least a Company Name or Contact Name.');
      return;
    }
    setManualList([...manualList, { ...manualForm }]);
    setManualForm({
      company_name: '', contact_name: '', contact_email: '', contact_phone: '',
      location: '', industry: '', type: '', website: '',
    });
  };

  const handleManualRemove = (idx) => {
    setManualList(manualList.filter((_, i) => i !== idx));
  };

  const handleManualImport = async () => {
    if (manualList.length === 0) return;
    setImporting(true);
    setResults(null);
    try {
      const res = await api.request('/import/bulk', { method: 'POST', body: {
        prospects: manualList,
        default_stage: defaultStage,
        default_source: defaultSource,
      } });
      setResults(res);
      if (res.imported > 0) {
        setManualList([]);
      }
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setImporting(false);
    }
  };

  const tabBtn = (id, label) => (
    <button
      onClick={() => { setActiveTab(id); setResults(null); }}
      style={{
        padding: '8px 20px',
        border: 'none',
        borderBottom: activeTab === id ? '2px solid #00D4AA' : '2px solid transparent',
        background: 'none',
        color: activeTab === id ? '#00D4AA' : '#64748B',
        fontWeight: activeTab === id ? 700 : 400,
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Import Prospects</h1>
      </div>

      {/* Shared settings */}
      <div style={{ ...cardStyle, display: 'flex', gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={labelStyle}>Default Stage</label>
          <select
            value={defaultStage}
            onChange={(e) => setDefaultStage(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
          >
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Default Source</label>
          <select
            value={defaultSource}
            onChange={(e) => setDefaultSource(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
          >
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', flex: 1, minWidth: 200 }}>
          These defaults apply to all imported records unless the data includes a "source" column.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E2E6EB', marginBottom: 20 }}>
        {tabBtn('paste', 'Paste CSV / JSON')}
        {tabBtn('manual', 'Manual Entry')}
      </div>

      {/* Results banner */}
      {results && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 6,
          marginBottom: 20,
          background: results.error ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${results.error ? '#FECACA' : '#BBF7D0'}`,
          color: results.error ? '#DC2626' : '#166534',
          fontSize: 14,
        }}>
          {results.error ? (
            <span>Error: {results.error}</span>
          ) : (
            <span>
              <strong>{results.imported}</strong> imported
              {results.skipped > 0 && <>, <strong>{results.skipped}</strong> skipped (duplicate active deal)</>}
              {results.errors?.length > 0 && (
                <>, <strong>{results.errors.length}</strong> errors</>
              )}
            </span>
          )}
          {results.errors?.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12 }}>
              {results.errors.map((e, i) => (
                <li key={i}><strong>{e.prospect || 'Unknown'}</strong>: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* PASTE TAB */}
      {activeTab === 'paste' && (
        <div style={cardStyle}>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 0 }}>
            Paste a CSV (with headers) or a JSON array. Supported column names:
          </p>
          <ul style={{ fontSize: 12, color: '#94a3b8', marginTop: 0, marginBottom: 16, paddingLeft: 20 }}>
            {FIELD_HINTS.map((h) => <li key={h}>{h}</li>)}
          </ul>

          <label style={labelStyle}>Paste data here</label>
          <textarea
            value={rawInput}
            onChange={(e) => { setRawInput(e.target.value); setParsed(false); setPreviewProspects([]); }}
            rows={10}
            placeholder={'company_name,contact_name,contact_email,location,industry\nAcme Corp,John Smith,john@acme.com,"Detroit, MI",Manufacturing\nBeta LLC,Jane Doe,jane@beta.com,"Chicago, IL",Retail'}
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              fontSize: 12,
              resize: 'vertical',
              marginBottom: 12,
            }}
          />

          {parseError && (
            <div style={{ color: '#DC2626', fontSize: 13, marginBottom: 10 }}>{parseError}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button
              onClick={handleParse}
              disabled={!rawInput.trim()}
              style={{
                padding: '8px 18px', background: '#1B2838', color: '#fff',
                border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
                cursor: rawInput.trim() ? 'pointer' : 'not-allowed', opacity: rawInput.trim() ? 1 : 0.5,
              }}
            >
              Parse
            </button>
            {parsed && previewProspects.length > 0 && (
              <button
                onClick={handlePasteImport}
                disabled={importing}
                style={{
                  padding: '8px 18px', background: '#00D4AA', color: '#1B2838',
                  border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 700,
                  cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? 'Importing...' : `Import ${previewProspects.length} records`}
              </button>
            )}
          </div>

          {parsed && previewProspects.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                Preview — {previewProspects.length} records found:
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F7F8FA' }}>
                      {['Company', 'Contact', 'Email', 'Phone', 'Location', 'Industry', 'Type', 'Website'].map((h) => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #E2E6EB', fontWeight: 600, color: '#1B2838', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewProspects.slice(0, 20).map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px', color: '#1B2838' }}>{p.company_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.contact_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.contact_email || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.contact_phone || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.location || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.industry || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.type || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.website || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewProspects.length > 20 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '6px 0' }}>
                    ...and {previewProspects.length - 20} more rows
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* MANUAL TAB */}
      {activeTab === 'manual' && (
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            {[
              { key: 'company_name', label: 'Company Name *' },
              { key: 'contact_name', label: 'Contact Name' },
              { key: 'contact_email', label: 'Email' },
              { key: 'contact_phone', label: 'Phone' },
              { key: 'location', label: 'Location' },
              { key: 'industry', label: 'Industry' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={labelStyle}>{label}</label>
                <input
                  type={key === 'contact_email' ? 'email' : 'text'}
                  value={manualForm[key]}
                  onChange={(e) => setManualForm({ ...manualForm, [key]: e.target.value })}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={labelStyle}>Type</label>
              <select
                value={manualForm.type}
                onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })}
                style={inputStyle}
              >
                <option value="">—</option>
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Website</label>
              <input
                type="text"
                value={manualForm.website}
                onChange={(e) => setManualForm({ ...manualForm, website: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            onClick={handleManualAdd}
            style={{
              padding: '8px 18px', background: '#1B2838', color: '#fff',
              border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', marginBottom: 20,
            }}
          >
            + Add to List
          </button>

          {manualList.length > 0 && (
            <>
              <div style={{ fontSize: 13, color: '#64748B', marginBottom: 8 }}>
                Ready to import — {manualList.length} record{manualList.length !== 1 ? 's' : ''}:
              </div>
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F7F8FA' }}>
                      {['Company', 'Contact', 'Email', 'Location', 'Industry', ''].map((h, i) => (
                        <th key={i} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #E2E6EB', fontWeight: 600, color: '#1B2838' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {manualList.map((p, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px', color: '#1B2838' }}>{p.company_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.contact_name || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.contact_email || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.location || '—'}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{p.industry || '—'}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <button
                            onClick={() => handleManualRemove(i)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
                          >
                            x
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleManualImport}
                disabled={importing}
                style={{
                  padding: '10px 24px', background: '#00D4AA', color: '#1B2838',
                  border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 700,
                  cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1,
                }}
              >
                {importing ? 'Importing...' : `Import All (${manualList.length})`}
              </button>
            </>
          )}

          {manualList.length === 0 && (
            <div style={{ fontSize: 13, color: '#94a3b8', paddingTop: 4 }}>
              Add records above then click "Import All" to send them to the pipeline.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
