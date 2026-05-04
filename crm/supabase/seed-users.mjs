// One-shot script to seed the two persistent admin users (Joe + Josh) in
// Supabase Auth. Run AFTER applying 0001_init_crm_schema.sql.
//
// Usage:
//   cd crm
//   node supabase/seed-users.mjs
//
// Outputs a password-recovery link for each user — paste those into a
// password manager / send to each person, they click it, set their real
// password, and they're in.

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local manually (this script runs outside Next.js).
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) config({ path: envPath });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  { email: 'joe@tkbsmarketing.com',  name: 'Joe Zolinski', role: 'admin' },
  { email: 'josh@tkbsmarketing.com', name: 'Josh Horsley', role: 'admin' },
];

let seeded = 0;
let alreadyExists = 0;

for (const u of USERS) {
  console.log(`\n→ ${u.name} (${u.email})`);

  // Try create. If user already exists, fall through to recovery-link gen.
  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email: u.email,
    password: randomUUID(),  // throwaway; user resets via recovery link below
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role },
  });

  if (createErr && !/already registered|exists/i.test(createErr.message)) {
    console.error(`  Failed to create: ${createErr.message}`);
    continue;
  }

  let userId;
  if (created?.user) {
    userId = created.user.id;
    console.log(`  Created auth user id=${userId}`);
    seeded++;
  } else {
    // Already-exists path: look up by email.
    const { data: list } = await sb.auth.admin.listUsers();
    const existing = list?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    if (!existing) {
      console.error(`  Could not find existing user`);
      continue;
    }
    userId = existing.id;
    console.log(`  Already exists, id=${userId}`);
    alreadyExists++;
  }

  // Promote to admin in crm.profiles. The handle_new_user_to_crm() trigger
  // should have already inserted the row with role from user_metadata, but
  // we update explicitly here to handle the existing-user case too.
  const { error: profileErr } = await sb
    .schema('crm')
    .from('profiles')
    .update({ role: u.role, name: u.name })
    .eq('id', userId);
  if (profileErr) {
    console.error(`  Failed to set crm.profiles role: ${profileErr.message}`);
  }

  // Generate a recovery link the user can click to set their real password.
  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: 'recovery',
    email: u.email,
  });
  if (linkErr) {
    console.error(`  Failed to generate recovery link: ${linkErr.message}`);
    continue;
  }
  console.log(`  Recovery link (send to ${u.name}):`);
  console.log(`    ${linkData.properties.action_link}`);
}

console.log(`\nDone. ${seeded} created, ${alreadyExists} already existed.`);
