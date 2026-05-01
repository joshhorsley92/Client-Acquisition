// Whisper auto-transcription for call_recordings.
//
// Runs the audio file through a LOCAL OpenAI Whisper install (the open-source
// model, free) by spawning the `python -m whisper` CLI. Designed to be
// fire-and-forget: callers should flip transcript_status to 'pending'
// synchronously, then invoke transcribeCallRecording(callId) without awaiting
// it. The function manages its own status transitions
// ('pending' -> 'processing' -> 'done' | 'failed') so the UI can poll
// GET /api/calls/:id and show progress.
//
// Why local instead of the API: zero per-minute cost, no API key, no PII
// leaving the laptop. Tradeoff: ~realtime transcription on CPU vs. ~10x
// faster on the OpenAI API. Swap this file out for the API call later if
// volume grows.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// Whisper model size. tiny.en is fastest (~75 MB, ~1.5x realtime on CPU);
// base.en is the next step up; small.en is sweet spot for real human audio
// (~245 MB, ~3-5x realtime on CPU). Override via env if you want better
// quality on real discovery calls.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny.en';
const WHISPER_PYTHON = process.env.WHISPER_PYTHON || 'python';
// Hard cap so a hung process doesn't keep the row in 'processing' forever.
// 30 minutes of audio at 1.5x realtime = ~45 min. 60 min is generous.
const WHISPER_TIMEOUT_MS = 60 * 60 * 1000;
// Pause length (seconds) above which we flip to the other speaker. Whisper
// segments are language-driven, not silence-driven, so any gap this large
// between consecutive segments is almost always a real handover. Tune up
// if false-positives in long monologues become annoying.
const SPEAKER_TURN_PAUSE_SECONDS = 1.0;

// Splits Whisper's segment array into alternating-speaker blocks based on
// pause length, then renders as `Speaker A: ...\n\nSpeaker B: ...`. Returns
// the plain transcript text (no labels) if there's only one block — labels
// would be noise on a monologue.
function applySpeakerLabels(segments, pauseSeconds = SPEAKER_TURN_PAUSE_SECONDS) {
  if (!Array.isArray(segments) || segments.length === 0) return '';
  const blocks = [];
  let current = { speaker: 'A', text: [segments[0].text.trim()] };
  for (let i = 1; i < segments.length; i++) {
    const gap = (segments[i].start ?? 0) - (segments[i - 1].end ?? 0);
    if (gap > pauseSeconds) {
      blocks.push(current);
      current = {
        speaker: current.speaker === 'A' ? 'B' : 'A',
        text: [segments[i].text.trim()],
      };
    } else {
      current.text.push(segments[i].text.trim());
    }
  }
  blocks.push(current);
  if (blocks.length === 1) return blocks[0].text.join(' ');
  return blocks.map((b) => `Speaker ${b.speaker}: ${b.text.join(' ')}`).join('\n\n');
}

function setStatus(db, callId, status, fields = {}) {
  const cols = ['transcript_status = ?'];
  const vals = [status];
  for (const [k, v] of Object.entries(fields)) {
    cols.push(`${k} = ?`);
    vals.push(v);
  }
  cols.push("updated_at = datetime('now')");
  vals.push(callId);
  db.prepare(`UPDATE call_recordings SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
}

// Run `python -m whisper` against an audio file. Resolves to the transcript
// text on success, rejects with a useful error otherwise. Output is written
// to a per-call temp dir, then read back and cleaned up.
function runWhisperCli(audioFullPath, callId) {
  return new Promise((resolve, reject) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `whisper-call-${callId}-`));
    const args = [
      '-m', 'whisper',
      audioFullPath,
      '--model', WHISPER_MODEL,
      '--output_format', 'json',
      '--output_dir', workDir,
      '--language', 'en',
      '--fp16', 'False',
      '--verbose', 'False',
    ];

    const child = spawn(WHISPER_PYTHON, args, {
      windowsHide: true,
      env: process.env,
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    // We don't need stdout — Whisper writes the transcript to disk. Drain to
    // avoid backpressure on large transcripts.
    child.stdout.on('data', () => {});

    const killer = setTimeout(() => {
      child.kill('SIGKILL');
      cleanup();
      reject(new Error(`Whisper timed out after ${Math.round(WHISPER_TIMEOUT_MS / 60000)} minutes`));
    }, WHISPER_TIMEOUT_MS);

    function cleanup() {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch (e) { /* best-effort */ }
    }

    child.on('error', (err) => {
      clearTimeout(killer);
      cleanup();
      if (err.code === 'ENOENT') {
        return reject(new Error(
          `Could not start "${WHISPER_PYTHON}". Install Python 3 and run "pip install openai-whisper", or set WHISPER_PYTHON to the right executable.`,
        ));
      }
      reject(err);
    });

    child.on('exit', (code) => {
      clearTimeout(killer);
      if (code !== 0) {
        const msg = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 500) || `exited with code ${code}`;
        cleanup();
        return reject(new Error(`Whisper failed: ${msg}`));
      }
      // Whisper writes <input-basename>.json to output_dir. We parse the
      // segments to infer speaker turns from inter-segment pauses.
      const base = path.basename(audioFullPath, path.extname(audioFullPath));
      const jsonPath = path.join(workDir, `${base}.json`);
      try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        const parsed = JSON.parse(raw);
        cleanup();
        const labeled = applySpeakerLabels(parsed.segments);
        const fallback = (parsed.text || '').trim();
        const text = labeled || fallback;
        if (!text) return reject(new Error('Whisper produced an empty transcript.'));
        resolve(text);
      } catch (err) {
        cleanup();
        reject(new Error(`Whisper produced no readable transcript: ${err.message}`));
      }
    });
  });
}

// Drives a single call_recording row through Whisper. Resolves quietly on
// success or failure — the row's transcript_status carries the outcome.
// Throws synchronously only if invoked with bad arguments.
async function transcribeCallRecording(db, callId) {
  if (!db || !callId) throw new Error('transcribeCallRecording requires db and callId');

  const call = db.prepare('SELECT * FROM call_recordings WHERE id = ?').get(callId);
  if (!call) return;
  if (!call.audio_path) {
    setStatus(db, callId, 'failed', { transcript_error: 'No audio file on this call.' });
    return;
  }

  const fullPath = path.join(__dirname, '..', '..', call.audio_path);
  if (!fs.existsSync(fullPath)) {
    setStatus(db, callId, 'failed', { transcript_error: 'Audio file is missing on disk.' });
    return;
  }

  setStatus(db, callId, 'processing', { transcript_error: null });

  try {
    const transcript = await runWhisperCli(fullPath, callId);
    setStatus(db, callId, 'done', {
      transcript,
      transcript_source: 'whisper',
      transcript_error: null,
    });
  } catch (err) {
    setStatus(db, callId, 'failed', {
      transcript_error: err.message || 'Transcription failed.',
    });
  }
}

module.exports = { transcribeCallRecording, applySpeakerLabels };
