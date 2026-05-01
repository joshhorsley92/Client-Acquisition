const { applySpeakerLabels } = require('../services/whisper-transcriber');

describe('applySpeakerLabels', () => {
  test('returns empty string for empty input', () => {
    expect(applySpeakerLabels([])).toBe('');
    expect(applySpeakerLabels(null)).toBe('');
    expect(applySpeakerLabels(undefined)).toBe('');
  });

  test('returns plain text for a single block (no labels on monologues)', () => {
    const segs = [
      { start: 0.0, end: 4.5, text: 'Hello there.' },
      { start: 4.7, end: 8.0, text: 'Welcome to the show.' },
    ];
    expect(applySpeakerLabels(segs)).toBe('Hello there. Welcome to the show.');
  });

  test('alternates A and B on pauses longer than the threshold', () => {
    const segs = [
      { start: 0.0, end: 5.0, text: 'How long have you been in business?' },
      { start: 6.5, end: 12.0, text: 'About seven years now.' }, // 1.5s gap → turn
      { start: 13.5, end: 18.0, text: 'And what is your biggest challenge?' }, // 1.5s gap → turn
    ];
    const out = applySpeakerLabels(segs);
    expect(out).toBe(
      'Speaker A: How long have you been in business?\n\n' +
      'Speaker B: About seven years now.\n\n' +
      'Speaker A: And what is your biggest challenge?'
    );
  });

  test('keeps consecutive segments under the threshold in the same block', () => {
    const segs = [
      { start: 0.0, end: 3.0, text: 'I want to talk about marketing.' },
      { start: 3.2, end: 6.0, text: 'It is hard to make work.' }, // 0.2s gap → same speaker
      { start: 7.5, end: 10.0, text: 'Yeah, I hear that a lot.' }, // 1.5s gap → turn
    ];
    expect(applySpeakerLabels(segs)).toBe(
      'Speaker A: I want to talk about marketing. It is hard to make work.\n\n' +
      'Speaker B: Yeah, I hear that a lot.'
    );
  });

  test('respects a custom pause threshold', () => {
    const segs = [
      { start: 0.0, end: 2.0, text: 'First.' },
      { start: 2.5, end: 4.0, text: 'Second.' }, // 0.5s gap
    ];
    // With a strict 0.3s threshold, the 0.5s gap counts as a turn.
    expect(applySpeakerLabels(segs, 0.3)).toBe('Speaker A: First.\n\nSpeaker B: Second.');
    // With a lax 1.0s threshold, both are one block (monologue → no labels).
    expect(applySpeakerLabels(segs, 1.0)).toBe('First. Second.');
  });
});
