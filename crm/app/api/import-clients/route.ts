// POST /api/import-clients
// Multipart upload of a CSV; one row → one client. Two-tier dedup:
//   1. source_lead_id match (UNIQUE index)
//   2. name+email case-insensitive match
// Returns { imported, skipped, errors, skipped_details, clients }.
//
// Reuses the same column contract as the prototype; tolerates unknown
// columns silently.

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { requireAuth, isAuthError } from '@/lib/api-auth';

const TEXT_COLUMNS = [
  'name', 'website', 'industry', 'location', 'type',
  'primary_contact_name', 'email', 'phone', 'role', 'preferred_contact',
  'notes',
  'source_platform', 'source_url', 'source_lead_id',
];
const VALID_TYPES = new Set(['B2B', 'B2C']);
const VALID_PREFERRED = new Set(['email', 'phone', 'text', 'linkedin']);

const lc = (v: unknown) => (v == null ? '' : String(v)).trim().toLowerCase();
const trim = (v: unknown) => (v == null ? null : (String(v).trim() || null));

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 }); }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file uploaded — POST a multipart/form-data with field "file".' },
      { status: 400 },
    );
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 400 });
  }

  const text = await file.text();
  let rows: any[];
  try {
    rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `CSV parse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'CSV is empty or has no header row.' }, { status: 400 });
  }
  if (rows.length > 5000) {
    return NextResponse.json(
      { error: `CSV has ${rows.length} rows; max is 5000 per import.` },
      { status: 400 },
    );
  }

  const imported: number[] = [];
  const errors: { row: number; reason: string }[] = [];
  const skippedReasons: { row: number; reason: string }[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const lookup: Record<string, unknown> = {};
    for (const k of Object.keys(row)) lookup[lc(k)] = row[k];
    const data: Record<string, string | null> = {};
    for (const col of TEXT_COLUMNS) data[col] = trim(lookup[col]);

    if (!data.name) {
      errors.push({ row: idx + 2, reason: 'Missing required "name" column' });
      continue;
    }
    if (data.type && !VALID_TYPES.has(data.type)) {
      errors.push({ row: idx + 2, reason: `Invalid type "${data.type}" (must be B2B or B2C)` });
      continue;
    }
    if (data.preferred_contact && !VALID_PREFERRED.has(data.preferred_contact)) {
      errors.push({ row: idx + 2, reason: `Invalid preferred_contact "${data.preferred_contact}"` });
      continue;
    }

    // Dedup: source_lead_id (UNIQUE) > name+email
    if (data.source_lead_id) {
      const { data: hit } = await supabase
        .from('clients').select('id, name').eq('source_lead_id', data.source_lead_id).maybeSingle();
      if (hit) {
        skippedReasons.push({
          row: idx + 2,
          reason: `Already in CRM as client #${hit.id} (${hit.name}) via source_lead_id`,
        });
        continue;
      }
    } else if (data.name && data.email) {
      const { data: hit } = await supabase
        .from('clients').select('id, name')
        .ilike('name', data.name).ilike('email', data.email).maybeSingle();
      if (hit) {
        skippedReasons.push({
          row: idx + 2,
          reason: `Already in CRM as client #${hit.id} (${hit.name}) via name+email`,
        });
        continue;
      }
    }

    const { data: created, error } = await supabase
      .from('clients')
      .insert({
        name: data.name,
        website: data.website,
        industry: data.industry,
        location: data.location,
        type: data.type,
        primary_contact_name: data.primary_contact_name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        preferred_contact: data.preferred_contact,
        notes: data.notes,
        source_platform: data.source_platform,
        source_url: data.source_url,
        source_lead_id: data.source_lead_id,
        source_imported_at: data.source_lead_id ? new Date().toISOString() : null,
        owner_id: auth.userId,
      })
      .select('id')
      .single();
    if (error) {
      errors.push({ row: idx + 2, reason: error.message });
    } else if (created) {
      imported.push(created.id as number);
    }
  }

  // Re-fetch the inserted rows to return full objects.
  const { data: clients } = imported.length
    ? await supabase.from('clients').select('*').in('id', imported)
    : { data: [] as any[] };

  return NextResponse.json({
    imported: imported.length,
    skipped: skippedReasons.length,
    errors,
    skipped_details: skippedReasons,
    clients: clients || [],
  });
}
