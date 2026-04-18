// Call recordings — capture layer for Call → Brand Profile flow.
// v2: scoped to a client (required) and optionally an engagement. Email
// address for Dashboard push comes from the client record.

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
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^audio\/|^video\/|octet-stream/i.test(file.mimetype) ||
               /\.(mp3|m4a|wav|ogg|webm|mp4|mov|aac|flac)$/i.test(file.originalname);
    if (!ok) return cb(new Error('File must be audio or video'));
    cb(null, true);
  },
});

router.get('/', (req, res) => {
  let query = `
    SELECT cr.*, cl.name AS client_name
    FROM call_recordings cr
    JOIN clients cl ON cr.client_id = cl.id`;
  const conditions = [];
  const params = [];

  if (req.query.client_id) {
    conditions.push('cr.client_id = ?');
    params.push(parseInt(req.query.client_id, 10));
  }
  if (req.query.engagement_id) {
    conditions.push('cr.engagement_id = ?');
    params.push(parseInt(req.query.engagement_id, 10));
  }
  if (req.query.review_status) {
    conditions.push('cr.review_status = ?');
    params.push(req.query.review_status);
  }

  if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY cr.created_at DESC, cr.id DESC LIMIT 200';

  const rows = req.db.prepare(query).all(...params);
  res.json({ calls: rows });
});

router.get('/:id', (req, res) => {
  const call = req.db.prepare(`
    SELECT cr.*, cl.name AS client_name, cl.email AS client_email
    FROM call_recordings cr
    JOIN clients cl ON cr.client_id = cl.id
    WHERE cr.id = ?
  `).get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });
  res.json({ call });
});

router.post('/', upload.single('audio'), (req, res) => {
  const { client_id, engagement_id, call_date, duration_minutes, transcript, notes } = req.body;

  if (!client_id) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'client_id is required' });
  }
  if (!req.file && !transcript?.trim()) {
    return res.status(400).json({ error: 'Provide an audio file or a transcript (or both)' });
  }

  const clientExists = req.db.prepare('SELECT id FROM clients WHERE id = ?').get(client_id);
  if (!clientExists) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Client not found' });
  }

  if (engagement_id) {
    const engagement = req.db.prepare(
      'SELECT id FROM engagements WHERE id = ? AND client_id = ?'
    ).get(engagement_id, client_id);
    if (!engagement) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'engagement_id does not belong to the given client' });
    }
  }

  const audioPath = req.file
    ? path.relative(path.join(__dirname, '..', '..'), req.file.path).replace(/\\/g, '/')
    : null;
  const transcriptSource = transcript?.trim() ? 'pasted' : null;

  const result = req.db.prepare(`
    INSERT INTO call_recordings (
      client_id, engagement_id, call_date, duration_minutes,
      audio_path, audio_original_name, audio_size_bytes,
      transcript, transcript_source, notes, created_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parseInt(client_id, 10),
    engagement_id ? parseInt(engagement_id, 10) : null,
    call_date || null,
    duration_minutes ? parseInt(duration_minutes, 10) : null,
    audioPath,
    req.file?.originalname || null,
    req.file?.size || null,
    transcript?.trim() || null,
    transcriptSource,
    notes || null,
    req.user.id,
  );

  req.audit('call_recording_created', 'call_recording', result.lastInsertRowid, {
    client_id: parseInt(client_id, 10),
    engagement_id: engagement_id ? parseInt(engagement_id, 10) : null,
    has_audio: !!req.file,
    has_transcript: !!transcript?.trim(),
  });

  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ call });
});

router.patch('/:id', (req, res) => {
  const existing = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Call not found' });

  const updates = [];
  const values = [];
  const allowed = [
    'call_date', 'duration_minutes', 'transcript', 'transcript_source',
    'notes', 'engagement_id', 'review_status', 'extracted_profile_json',
  ];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

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

router.delete('/:id', (req, res) => {
  const call = req.db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!call) return res.status(404).json({ error: 'Call not found' });

  if (call.audio_path) {
    const fullPath = path.join(__dirname, '..', '..', call.audio_path);
    fs.unlink(fullPath, () => {});
  }

  req.db.prepare('DELETE FROM call_recordings WHERE id = ?').run(req.params.id);
  req.audit('call_recording_deleted', 'call_recording', req.params.id, {});
  res.json({ ok: true });
});

// Extract Brand Profile from transcript via Claude.
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
      client_id: call.client_id,
      engagement_id: call.engagement_id,
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

router.get('/:id/audio', (req, res) => {
  const call = req.db.prepare('SELECT audio_path, audio_original_name FROM call_recordings WHERE id = ?').get(req.params.id);
  if (!call || !call.audio_path) return res.status(404).json({ error: 'No audio file for this call' });
  const fullPath = path.join(__dirname, '..', '..', call.audio_path);
  if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Audio file missing on disk' });
  res.download(fullPath, call.audio_original_name || 'call-audio');
});

router.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

module.exports = router;
