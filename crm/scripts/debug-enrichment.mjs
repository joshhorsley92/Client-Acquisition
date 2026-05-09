// Dump everything we wrote to lead_candidates for the failing rows.
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'crm' } },
);

const { data, error } = await sb
  .from('lead_candidates')
  .select('*');
if (error) { console.error(error); process.exit(1); }

for (const c of data ?? []) {
  console.log('---');
  console.log(`#${c.id} ${c.name}`);
  console.log(`  website: ${c.website}`);
  console.log(`  status: ${c.status}`);
  console.log(`  enriched_at: ${c.enriched_at}`);
  console.log(`  opportunity_signals: ${JSON.stringify(c.opportunity_signals)}`);
  console.log(`  opportunity_score: ${c.opportunity_score}`);
  console.log(`  enrich_error: ${c.enrich_error || '(none)'}`);
  console.log(`  enrichment_data: ${JSON.stringify(c.enrichment_data, null, 2)}`);
}
