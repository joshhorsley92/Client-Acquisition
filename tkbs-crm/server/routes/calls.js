// Call recordings — capture layer for Initiative 1 (Call → Brand Profile).
// Stage 1 of 5: store audio + transcript linked to a deal. Whisper + Claude
// extraction come in later stages.

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'call-recordings');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9.\-_]/gi, '_');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${unique}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB — long calls
  fileFilter: (req, file, cb) => {
    const ok = /^audio\/|^video\/|octet-stream/i.test(file.mimetype) ||
               /\.(mp3|m4a|wav|ogg|webm|mp4|mov|aac|flac)$/i.test(file.originalname);
    if (!ok) return cb(new Error('File must be audio or video'));
    cb(null, true);
  },
});

// List — optionally filter by deal_id
router.get('/', (req, res) => {
  const dealId = req.query.deal_id ? parseInt(req.query.deal_id) : null;
  const rows = dealId
    ? req.db.prepare(`
        SELECT c.*, d.id AS deal_id, co.name AS company_name
        FROM call_recordings c
        LEFT JOIN deals d ON c.deal_id = d.id
        LEFT JOIN companies co ON d.company_id = co.id
        WHERE c.deal_id = ?
        ORDER BY c.created_at DESC, c.id DESC
      `).all(dealId)
    : req.db.prepare(`
        SELECT c.*, d.id AS deal_id, co.name AS company_name
        FROM call_recordings c
        LEFT JOIN deals d ON c.deal_id = d.id
        LEFT JOIN companies co ON d.company_id = co.id
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT 200
      `).all();
  res.json({ calls: rows });
});

// Single call detail
router.get('/:id', (req, res) => {
  const call = req.db.prepare(`
    SELECT c.*, d.id AS deal_id, co.name AS company_name, co.id AS company_id
    FROM call_recordings c
    LEFT JOIN deals d ON c.deal_id = d.id
    LEFT JOIN companies co ON d.company_id = co.id
    WHERE c.id = ?
  `).get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ call });
});

// Create — multipart/form-data with optional audio file + optional transcript
router.post('/', upload.single('audio'), (req, res) => {
  const { deal_id, contact_id, call_date, duration_minutes, transcript, notes } = req.body;

  if (!deal_id) {
    return res.status(400).json({ error: 'deal_id is required' });
  }

  // Must have either an audio file OR a transcript to be useful
  if (!req.file && !transcript?.trim()) {
    return res.status(400).json({ error: 'Provide an audio file or a transcript (or both)' });
  }

  const dealExists = req.db.prepare('SELECT id FROM deals WHERE id = ?').get(deal_id);
  if (!dealExists) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Deal not found' });
  }

  const audioPath = req.file ? path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/') : null;
  const transcriptSource = transcript?.trim() ? 'pasted' : null;

  const result = req.db.prepare(`
    INSERT INTO call_recordings (
      deal_id, contact_id, call_date, duration_minutes,
      audio_path, audio_original_name, audio_size_bytes,
      transcript, transcript_source, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(deal_id),
    contact_id ? parseInt(contact_id) : null,
    call_date || null,
    duration_minutes ? parseInt(duration_minutes) : null,
    audioPath,
    req.file?.originalname || null,
    req.file?.size || null,
    transcript?.trim() || null,
    transcriptSource,
    notes || null,
    req.user.id
  );

  req.audit('call_recording_created', 'call_recording', result.lastInsertRowid, {
    deal_id: parseInt(deal_id),
    has_audio: !!req.file,
    has_transcript: !!transcript?.trim(),
  });

  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ call });
});

// Update transcript / notes / call metadata (not the audio file itself)
router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Call not found' });

  const updates = [];
  const values = [];
  const allowed = ['call_date', 'duration_minutes', 'transcript', 'transcript_source', 'notes', 'contact_id', 'review_status'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  // If transcript was pasted manually and no source was given, mark it
  if (req.body.transcript !== undefined && req.body.transcript_source === undefined) {
    updates.push('transcript_source = ?');
    values.push(req.body.transcript?.trim() ? 'pasted' : null);
  }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);

  req.db.prepare(`UPDATE call_recordings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  req.audit('call_recording_updated', 'call_recording', req.params.id, { fields: Object.keys(req.body) });

  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  res.json({ call });
});

// Delete (removes audio file from disk)
router.delete('/:id', (req, res) => {
  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  if (call.audio_path) {
    const fullPath = path.join(__dirname, '..', '..', call.audio_path);
    fs.unlink(fullPath, () => { /* best-effort */ });
  }

  req.db.prepare('DELETE FROM call_recordings WHERE id = ?').run(req.params.id);
  req.audit('call_recording_deleted', 'call_recording', req.params.id, {});
  res.json({ ok: true });
});

// Extract Brand Profile from transcript via Claude.
// Stores result in extracted_profile_json and flips review_status to 'pending'.
router.post('/:id/extract-brand-profile', async (req, res) => {
  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  if (!call.transcript || !call.transcript.trim()) {
    return res.status(400).json({ error: 'This call has no transcript. Paste one first (or wait for Whisper).' });
  }

  try {
    const { extractBrandProfile, computeCompletion } = require('../services/brand-profile-extractor');
    const started = Date.now();
    const result = await extractBrandProfile(call.transcript);
    const ms = Date.now() - started;

    const payload = {
      profile: result.profile,
      sidecar: result.sidecar,
      completion_percent: computeCompletion(result.profile),
      extracted_at: new Date().toISOString(),
      model: result.model,
      usage: result.usage,
      duration_ms: ms,
    };

    req.db.prepare(`
      UPDATE call_recordings
      SET extracted_profile_json = ?, review_status = 'pending', updated_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(payload), req.params.id);

    req.audit('brand_profile_extracted', 'call_recording', req.params.id, {
      deal_id: call.deal_id,
      completion_percent: payload.completion_percent,
      tokens_input: result.usage?.input_tokens,
      tokens_output: result.usage?.output_tokens,
      model: result.model,
    });

    res.json({ extraction: payload });
  } catch (err) {
    if (err.code === 'NO_API_KEY') {
      return res.status(503).json({ error: 'Extraction unavailable — ANTHROPIC_API_KEY not set on the server.' });
    }
    console.error('Extraction failed:', err);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

// Download audio (streams the file)
router.get('/:id/audio', (req, res) => {
  const call = req.db.prepare('SELECT audio_path, audio_original_name FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!call || !call.audio_path) return res.status(404).json({ error: 'No audio file for this call' });
  const fullPath = path.join(__dirname, '..', '..', call.audio_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Audio file missing on disk' });
  res.download(fullPath, call.audio_original_name || 'call-audio');
});

// Multer error handler — fileSize limit, wrong mimetype, etc.
router.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
