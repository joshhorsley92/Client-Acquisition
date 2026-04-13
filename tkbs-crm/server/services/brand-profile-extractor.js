// Brand Profile extractor — Initiative 1 Stage 3.
// Takes a call transcript, asks Claude to synthesize it into a Brand Profile
// matching the TKBS Dashboard schema exactly (from types/database.ts).
//
// Returns both the profile fields AND a sidecar with confidence + source quote
// per field, so Josh can verify each extracted value during review (Stage 4).

const Anthropic = require('@anthropic-ai/sdk');

// Mirrors the Dashboard's BrandProfile type (types/database.ts). Kept here as
// a JSON schema so the prompt can enforce output structure. Any change to the
// Dashboard schema must be reflected here OR we risk producing profiles the
// Dashboard rejects on PATCH /api/brand.
const BRAND_PROFILE_SCHEMA = {
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

1. \`profile\` — the extracted Brand Profile matching the Dashboard schema.
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

const MODEL = 'claude-opus-4-6'; // Opus for accuracy on intake — runs rarely (one per discovery call)
const MAX_TOKENS = 4096;

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
 * Extract a Brand Profile from a transcript.
 * @param {string} transcript - The call transcript text.
 * @param {object} options - { model?: string }
 * @returns {Promise<{profile, sidecar, usage, model}>}
 */
async function extractBrandProfile(transcript, options = {}) {
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
        cache_control: { type: 'ephemeral' }, // schema + rubric change rarely; cache them
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Transcript:\n\n${transcript}\n\nReturn the JSON now.`,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  // Claude sometimes wraps in ```json ... ``` despite instructions. Strip.
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const preview = cleaned.slice(0, 200);
    throw new Error(`Claude returned invalid JSON. First 200 chars: ${preview}`);
  }

  if (!parsed.profile || typeof parsed.profile !== 'object') {
    throw new Error('Claude output missing required "profile" key');
  }

  // Validate required Dashboard fields exist as keys (may be null — that's ok)
  const expectedKeys = [
    'business_name', 'industry', 'customer_avatar',
    'brand_personality', 'visual_identity', 'brand_voice',
  ];
  for (const key of expectedKeys) {
    if (!(key in parsed.profile)) {
      parsed.profile[key] = key.includes('_') && !['business_name', 'industry'].includes(key)
        ? {}
        : null;
    }
  }

  return {
    profile: parsed.profile,
    sidecar: parsed.sidecar || {},
    usage: response.usage,
    model: response.model,
  };
}

/**
 * Compute completion percent matching the Dashboard's trigger logic.
 * Minimum required: business_name, industry, customer_avatar.name,
 * customer_avatar.pain_points, brand_personality.traits,
 * visual_identity.primary_color, brand_voice.tone.
 */
function computeCompletion(profile) {
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

module.exports = { extractBrandProfile, computeCompletion, BRAND_PROFILE_SCHEMA };
