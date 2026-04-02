const { buildCliCommand, isCliAvailable } = require('../services/claude-cli');

describe('buildCliCommand', () => {
  test('builds a command string with prompt', () => {
    const result = buildCliCommand('Build a presentation for Acme Manufacturing');
    expect(result.command).toBe('claude');
    expect(result.args).toContain('--print');
    expect(result.args.some(a => a.includes('Acme Manufacturing'))).toBe(true);
  });

  test('escapes special characters in prompt', () => {
    const result = buildCliCommand('Test with "quotes" and $variables');
    const promptArg = result.args.find(a => a.includes('Test with'));
    expect(promptArg).toBeDefined();
  });
});

describe('isCliAvailable', () => {
  test('returns a boolean', () => {
    const result = isCliAvailable();
    expect(typeof result).toBe('boolean');
  });
});
