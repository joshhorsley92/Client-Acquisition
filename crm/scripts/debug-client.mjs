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
  .from('clients')
  .select('id, name, industry, location, type, employee_count, revenue_estimate, primary_contact_name, email, phone, role, enrichment_status, brand_profile, brand_profile_sources, enrichment_data')
  .ilike('name', '%foundations%');
if (error) { console.error(error); process.exit(1); }
for (const c of data ?? []) {
  console.log(`#${c.id} ${c.name}`);
  console.log('  industry:', c.industry);
  console.log('  location:', c.location);
  console.log('  type:', c.type);
  console.log('  primary_contact_name:', c.primary_contact_name);
  console.log('  email:', c.email);
  console.log('  phone:', c.phone);
  console.log('  role:', c.role);
  console.log('  enrichment_status:', c.enrichment_status);
  console.log('  brand_profile keys:', Object.keys(c.brand_profile || {}));
  console.log('  brand_profile_sources keys:', Object.keys(c.brand_profile_sources || {}).length);
  console.log('  enrichment_data keys:', Object.keys(c.enrichment_data || {}));
}
