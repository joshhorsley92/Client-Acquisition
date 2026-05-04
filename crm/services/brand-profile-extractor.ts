// Brand Profile extractor — calls Claude with a strict JSON schema and
// returns the structured profile + a per-field sidecar (confidence + source
// quote) so the user can review extractions during call review.
//
// Pure function. No DB dependencies. Imported by /api/calls/[id]/extract-brand-profile.

import Anthropic from '@anthropic-ai/sdk';

export const BRAND_PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    business_name: { type: ['string', 'null'] },
    industry: { type: ['string', 'null'] },
    business_description: { type: ['string', 'null'] },
    website_url: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    location_city: { type: ['string', 'null'] },
    location_state: { type: ['string', 'null'] },
    years_in_business: { type: ['integer', 'null'] },
    revenue_streams: { type: ['string', 'null'] },
    customer_avatar: {
      type: 'object',
      properties: {
        name: { type: ['string', 'null'] },
        age_range: { type: ['string', 'null'] },
        gender: { type: ['string', 'null'] },
        occupation: { type: ['string', 'null'] },
        pain_points: { type: 'array', items: { type: 'string' } },
        goals: { type: 'array', items: { type: 'string' } },
        objections: { type: 'array', items: { type: 'string' } },
        where_online: { type: 'array', items: { type: 'string' } },
      },
    },
    brand_personality: {
      type: 'object',
      properties: {
        traits: { type: 'array', items: { type: 'string' } },
        mood: { type: ['string', 'null'] },
        formality_level: { type: ['string', 'null'], enum: ['casual', 'neutral', 'formal', null] },
        keywords: { type: 'array', items: { type: 'string' } },
      },
    },
    visual_identity: {
      type: 'object',
      properties: {
        primary_color: { type: ['string', 'null'] },
        secondary_color: { type: ['string', 'null'] },
        accent_color: { type: ['string', 'null'] },
        neutral_color: { type: ['string', 'null'] },
        heading_font: { type: ['string', 'null'] },
        body_font: { type: ['string', 'null'] },
        style_keywords: { type: 'array', items: { type: 'string' } },
      },
    },
    brand_voice: {
      type: 'object',
      properties: {
        tone: { type: 'array', items: { type: 'string' } },
        dos: { type: 'array', items: { type: 'string' } },
        donts: { type: 'array', items: { type: 'string' } },
        sample_phrases: { type: 'array', items: { type: 'string' } },
        tagline: { type: ['string', 'null'] },
      },
    },
  },
};

const SYSTEM_PROMPT = `You are extracting a Brand Profile from a sales call transcript for TKBS, a marketing agency. The Brand Profile will be used to generate marketing materials for the prospect.

Your task:
1. Read the transcript carefully.
2. Extract ONLY information that the prospect (or speakers on their behalf) actually stated or strongly implied.
3. For any field not discussed or not inferable, leave it null (scalars) or [] (arrays). DO NOT invent, guess, or fill placeholder values.
4. Output valid JSON matching the exact schema below.

## Output format

Return a single JSON object with two top-level keys:

1. \`profile\` — the extracted Brand Profile in the shape below.
2. \`sidecar\` — a parallel object with the same field paths, where each leaf value is either \`null\` (if field wasn't extracted) OR an object \`{ "confidence": 0.0-1.0, "source_quote": "verbatim quote from transcript" }\`.

## Brand Profile schema

\`\`\`json
${JSON.stringify(BRAND_PROFILE_SCHEMA, null, 2)}
\`\`\`

## Field notes

- **business_name**: legal or doing-business-as name the prospect used
- **industry**: broad category (e.g. "Women's Fashion", "Home Services", "B2B SaaS")
- **customer_avatar.pain_points**: problems the prospect's customers have (not problems the prospect has)
- **customer_avatar.goals**: what the prospect's customers want to achieve
- **brand_personality.traits**: 3-5 adjectives describing the prospect's brand (e.g. "bold", "approachable", "expert")
- **brand_personality.formality_level**: one of "casual", "neutral", "formal", or null
- **visual_identity.primary_color**: hex code (e.g. "#1B2838") only if explicitly stated; null otherwise
- **brand_voice.tone**: tone adjectives (e.g. "warm", "direct", "authoritative")
- **brand_voice.dos / donts**: writing rules (e.g. dos: ["use inclusive language"], donts: ["corporate jargon"])

## Confidence rubric

- 0.9-1.0: prospect stated this explicitly and unambiguously
- 0.7-0.9: prospect strongly implied this with specific context
- 0.5-0.7: plausible inference from multiple hints
- 0.3-0.5: weak signal, worth flagging for review
- Below 0.3: don't extract (leave null)

## Critical rules

- Output ONLY the JSON object. No markdown code fences, no prose, no explanation.
- source_quote must be a VERBATIM substring of the transcript, not a paraphrase.
- If the transcript is empty or clearly unrelated to a business discussion, return profile with all nulls/empty arrays.`;

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = 4096;

export interface ExtractionResult {
  profile: Record<string, unknown>;
  sidecar: Record<string, unknown>;
  usage: unknown;
  model: string;
}

export class NoApiKeyError extends Error {
  code = 'NO_API_KEY';
}

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new NoApiKeyError('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey });
}

export async function extractBrandProfile(
  transcript: string,
  options: { model?: string } = {},
): Promise<ExtractionResult> {
  if (!transcript || !transcript.trim()) {
    throw new Error('Transcript is empty');
  }
  if (transcript.length < 50) {
    throw new Error('Transcript too short to extract meaningful data (minimum 50 chars)');
  }

  const client = getClient();
  const model = options.model || MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: `Transcript:\n\n${transcript}\n\nReturn the JSON now.` },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('')
    .trim();

  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  let parsed: { profile?: Record<string, unknown>; sidecar?: Record<string, unknown> };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON. First 200 chars: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed.profile || typeof parsed.profile !== 'object') {
    throw new Error('Claude output missing required "profile" key');
  }

  return {
    profile: parsed.profile,
    sidecar: parsed.sidecar || {},
    usage: response.usage,
    model: response.model,
  };
}

export function computeCompletion(profile: any): number {
  if (!profile) return 0;
  const checks = [
    !!profile.business_name,
    !!profile.industry,
    !!profile.customer_avatar?.name,
    (profile.customer_avatar?.pain_points?.length || 0) > 0,
    (profile.brand_personality?.traits?.length || 0) > 0,
    !!profile.visual_identity?.primary_color,
    (profile.brand_voice?.tone?.length || 0) > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
