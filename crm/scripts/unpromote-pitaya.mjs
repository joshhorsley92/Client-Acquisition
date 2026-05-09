// Undo an accidental promote. Finds the candidate by name, deletes the
// crm.clients row that was created on promote, resets the candidate back
// to status='enriched'.

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

const { data: candidate, error: e1 } = await sb
  .from('lead_candidates')
  .select('id, name, status, promoted_client_id')
  .ilike('name', 'Pitaya')
  .maybeSingle();
if (e1) { console.error(e1); process.exit(1); }
if (!candidate) { console.error('No Pitaya candidate found'); process.exit(1); }

console.log('Before:', candidate);

if (candidate.promoted_client_id) {
  const { error: e2 } = await sb
    .from('clients')
    .delete()
    .eq('id', candidate.promoted_client_id);
  if (e2) { console.error('Failed to delete client row:', e2); process.exit(1); }
  console.log(`Deleted clients row #${candidate.promoted_client_id}`);
} else {
  console.log('Candidate has no promoted_client_id — nothing to delete in clients');
}

const { data: reset, error: e3 } = await sb
  .from('lead_candidates')
  .update({ status: 'enriched', promoted_client_id: null })
  .eq('id', candidate.id)
  .select('id, name, status, promoted_client_id')
  .single();
if (e3) { console.error('Failed to reset candidate:', e3); process.exit(1); }
console.log('After:', reset);
