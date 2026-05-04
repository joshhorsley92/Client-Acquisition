// Thin wrapper around the Anthropic SDK for one-shot prompt → text completion.
// Used by Automations (proposal generation, etc.). Shares the
// ANTHROPIC_API_KEY env var with brand-profile-extractor.

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 8_000;

export class NoApiKeyError extends Error {
  code = 'NO_API_KEY';
}

export function isConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NoApiKeyError('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey });
}

export interface RunPromptOptions {
  model?: string;
  maxTokens?: number;
  system?: string;
}

export interface RunPromptResult {
  output: string;
  model: string;
  usage: unknown;
}

export async function runPrompt(
  prompt: string,
  options: RunPromptOptions = {},
): Promise<RunPromptResult> {
  const client = getClient();
  const params: any = {
    model: options.model || DEFAULT_MODEL,
    max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  };
  if (options.system) {
    params.system = [
      { type: 'text', text: options.system, cache_control: { type: 'ephemeral' } },
    ];
  }

  const response = await client.messages.create(params);
  const output = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('')
    .trim();
  return { output, model: response.model, usage: response.usage };
}

export { DEFAULT_MODEL };
