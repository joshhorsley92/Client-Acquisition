// Thin wrapper around the Anthropic SDK for one-shot prompt → text completion.
// Used by the Automations flow (proposal generation, etc.). Shares the same
// ANTHROPIC_API_KEY env var brand-profile-extractor uses — one key for all AI
// features.

const Anthropic = require('@anthropic-ai/sdk');

// Sonnet is the right default for longer outputs like a full proposal: quality
// is near-Opus but latency is much tighter, and Opus's depth isn't needed for
// structured marketing copy.
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8_000;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error('ANTHROPIC_API_KEY not set in .env');
    err.code = 'NO_API_KEY';
    throw err;
  }
  return new Anthropic({ apiKey });
}

/**
 * Run a prompt through Claude. Resolves with the model's text output plus
 * metadata (model, token usage).
 *
 * @param {string} prompt - the full user message to send
 * @param {object} [options]
 * @param {string} [options.model]      - override the default model id
 * @param {number} [options.maxTokens]  - override default max_tokens
 * @param {string} [options.system]     - optional system prompt (gets cache-controlled so repeated runs
 *                                        with the same system text are near-free on the input side)
 */
async function runPrompt(prompt, options = {}) {
  const client = getClient();
  const model = options.model || DEFAULT_MODEL;
  const maxTokens = options.maxTokens || DEFAULT_MAX_TOKENS;

  const params = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  if (options.system) {
    params.system = [
      { type: 'text', text: options.system, cache_control: { type: 'ephemeral' } },
    ];
  }

  const response = await client.messages.create(params);

  const output = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  return {
    output,
    model: response.model,
    usage: response.usage,
  };
}

module.exports = { isConfigured, runPrompt, DEFAULT_MODEL };
