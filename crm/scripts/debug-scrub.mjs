// Reproduce what scrubWebsite does for foundationstreeexperts.com so we
// can see exactly what Claude got and what it returned.

import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const URL_TO_TEST = 'https://foundationstreeexperts.com/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_TEXT_CHARS = 25_000;

console.log(`Fetching ${URL_TO_TEST}...`);
const res = await fetch(URL_TO_TEST, {
  headers: {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  redirect: 'follow',
});
console.log(`  status: ${res.status}, final url: ${res.url}`);
const html = await res.text();
console.log(`  html length: ${html.length}`);

const $ = cheerio.load(html);
$('script, style, svg, noscript, template, iframe').remove();

const title = ($('head > title').first().text() || '').trim();
const metaDesc = ($('meta[name="description"]').attr('content') || '').trim();
const ogDesc = ($('meta[property="og:description"]').attr('content') || '').trim();
const h1s = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean);

const bodyText = ($('body').text() || '')
  .replace(/[ \t]+/g, ' ')
  .split('\n')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)
  .join('\n');

const header = [
  title && `TITLE: ${title}`,
  metaDesc && `META DESCRIPTION: ${metaDesc}`,
  ogDesc && ogDesc !== metaDesc && `OG DESCRIPTION: ${ogDesc}`,
  h1s.length > 0 && `H1S: ${h1s.join(' | ')}`,
].filter(Boolean).join('\n');

const combined = header ? `${header}\n\n---\n\n${bodyText}` : bodyText;
const text = combined.length > MAX_TEXT_CHARS ? combined.slice(0, MAX_TEXT_CHARS) + '\n\n[truncated]' : combined;

console.log('---');
console.log(`page_text_length: ${text.length}`);
console.log('---');
console.log('FIRST 1500 CHARS OF EXTRACTED TEXT:');
console.log(text.slice(0, 1500));
console.log('---');

console.log('Calling Claude...');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SYSTEM = `You are extracting a Brand Profile from a prospect's website content for TKBS, a marketing agency. Output ONLY a JSON object with keys: profile (with business_name, industry, location_city, location_state, customer_avatar, brand_personality, brand_voice), and basic_fields (with type [B2B|B2C|null], employee_count, revenue_estimate, primary_contact_name, primary_contact_role, primary_email, primary_phone, location_city, location_state). Use null for fields not substantiated by the page content. NO markdown, NO prose.`;

const start = Date.now();
const r = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 2048,
  system: SYSTEM,
  messages: [{ role: 'user', content: `Website content:\n\n${text}\n\nReturn the JSON now.` }],
});
const elapsed = Date.now() - start;
console.log(`Claude responded in ${elapsed}ms`);

const out = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
const cleaned = out.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '').trim();
console.log('---');
console.log('CLAUDE OUTPUT:');
console.log(cleaned);
