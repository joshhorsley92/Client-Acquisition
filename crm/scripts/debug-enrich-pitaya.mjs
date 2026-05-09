// Run the *real* enrichCandidate against Pitaya so we see exactly what
// the production code path returns.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const { enrichCandidate } = await import('../services/lead-discovery/enrichment.ts');
const res = await enrichCandidate({
  website: 'http://pitaya.myshopify.com/',
  google_rating: 3.6,
  google_reviews_ct: 35,
  email: null,
});
console.log(JSON.stringify(res, null, 2));
