// CSV-driven bulk client import.
//
// POST /api/import-clients  (multipart/form-data, field "file")
//   Body: a CSV with `name` required + optional descriptive/source columns.
//   Returns: { imported, skipped, errors: [{ row, reason }], clients: [...] }
//
// Dedup rules (in order):
//   1. If row has source_lead_id and a client already exists with that
//      source_lead_id → skip (matches the upstream Python bridge contract).
//   2. Else if row has both name AND email and a client matches both
//      (case-insensitive) → skip.
//   3. Else insert.

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'csv-imports');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = (file.originalname || 'upload').replace(/[^a-z0-9.\-_]/gi, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — plenty for 50k rows
  fileFilter: (req, file, cb) => {
    const ok = /^text\/csv|application\/vnd\.ms-excel|application\/csv|text\/plain|octet-stream/i.test(file.mimetype) ||
               /\.csv$/i.test(file.originalname);
    if (!ok) return cb(new Error('File must be a .csv'));
    cb(null, true);
  },
});

// Columns the CRM accepts. Anything else in the CSV is silently ignored —
// keeps the import tolerant of common extra spreadsheet columns.
const TEXT_COLUMNS = [
  'name', 'website', 'industry', 'location', 'type',
  'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
  'notes',
  'source_platform', 'source_url', 'source_lead_id',
];
const VALID_TYPES = new Set(['B2B', 'B2C']);
const VALID_PREFERRED = new Set(['email', 'phone', 'text', 'linkedin']);

function lc(v) { return (v == null ? '' : String(v)).trim().toLowerCase(); }
function trim(v) { return v == null ? null : String(v).trim() || null; }

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded — POST a multipart/form-data with field "file".' });

  let rows;
  try {
    const raw = fs.readFileSync(req.file.path, 'utf-8');
    rows = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `CSV parse failed: ${err.message}` });
  } finally {
    // Clean up the uploaded file regardless — we've already parsed it.
    fs.unlink(req.file.path, () => {});
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'CSV is empty or has no header row.' });
  }
  if (rows.length > 5000) {
    return res.status(400).json({ error: `CSV has ${rows.length} rows; max is 5000 per import.` });
  }

  const imported = [];
  const errors = [];
  const skippedReasons = [];

  // Use a single transaction so a mid-batch failure doesn't leave a half-imported state.
  const insertStmt = req.db.prepare(`
    INSERT INTO clients (
      name, website, industry, location, type,
      primary_contact_name, email, phone, role, preferred_contact,
      notes,
      source_platform, source_url, source_lead_id, source_imported_at,
      enrichment_status, owner_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?)
  `);
  const findBySourceLeadId = req.db.prepare('SELECT id, name FROM clients WHERE source_lead_id = ?');
  const findByNameAndEmail = req.db.prepare(
    'SELECT id, name FROM clients WHERE LOWER(name) = ? AND LOWER(email) = ?'
  );

  const tx = req.db.transaction(() => {
    rows.forEach((row, idx) => {
      // Map CSV columns (case-insensitive header lookup).
      const lookup = {};
      for (const k of Object.keys(row)) lookup[lc(k)] = row[k];
      const data = {};
      for (const col of TEXT_COLUMNS) data[col] = trim(lookup[col]);

      if (!data.name) {
        errors.push({ row: idx + 2, reason: 'Missing required "name" column' }); // +2 for header + 1-index
        return;
      }
      if (data.type && !VALID_TYPES.has(data.type)) {
        errors.push({ row: idx + 2, reason: `Invalid type "${data.type}" (must be B2B or B2C)` });
        return;
      }
      if (data.preferred_contact && !VALID_PREFERRED.has(data.preferred_contact)) {
        errors.push({ row: idx + 2, reason: `Invalid preferred_contact "${data.preferred_contact}"` });
        return;
      }

      // Dedup
      if (data.source_lead_id) {
        const hit = findBySourceLeadId.get(data.source_lead_id);
        if (hit) {
          skippedReasons.push({ row: idx + 2, reason: `Already in CRM as client #${hit.id} (${hit.name}) via source_lead_id` });
          return;
        }
      } else if (data.name && data.email) {
        const hit = findByNameAndEmail.get(lc(data.name), lc(data.email));
        if (hit) {
          skippedReasons.push({ row: idx + 2, reason: `Already in CRM as client #${hit.id} (${hit.name}) via name+email` });
          return;
        }
      }

      try {
        const result = insertStmt.run(
          data.name,
          data.website,
          data.industry,
          data.location,
          data.type,
          data.primary_contact_name,
          data.email,
          data.phone,
          data.role,
          data.preferred_contact,
          data.notes,
          data.source_platform,
          data.source_url,
          data.source_lead_id,
          data.source_lead_id ? new Date().toISOString() : null,
          req.user.id,
        );
        imported.push(result.lastInsertRowid);
      } catch (err) {
        errors.push({ row: idx + 2, reason: err.message || 'Insert failed' });
      }
    });
  });

  try {
    tx();
  } catch (err) {
    return res.status(500).json({ error: `Import transaction failed: ${err.message}` });
  }

  // Fetch the inserted rows to return them
  const clients = imported.length
    ? req.db.prepare(`SELECT * FROM clients WHERE id IN (${imported.map(() => '?').join(',')})`).all(...imported)
    : [];

  req.audit('clients_imported_csv', 'client_batch', null, {
    imported: imported.length,
    skipped: skippedReasons.length,
    errors: errors.length,
    total_rows: rows.length,
  });

  res.json({
    imported: imported.length,
    skipped: skippedReasons.length,
    errors,
    skipped_details: skippedReasons,
    clients,
  });
});

router.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
