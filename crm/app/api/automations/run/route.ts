// POST /api/automations/run
// Body: { automation: 'proposal', client_id: ..., engagement_id?: ... }
// Returns immediately with a generation_jobs row id; the Claude call runs
// in the background and writes the output back via the service-role client.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { isConfigured, runPrompt } from '@/services/claude-api';
import { buildPrompt } from '@/services/ai-prompts';
import { getLatestBrandProfile } from '@/services/brand-profile-loader';
import { AUTOMATIONS } from '@/services/automation-registry';
import { audit } from '@/lib/audit';
import { AutomationRunSchema } from '@/lib/schemas';

export async function POST(req: NextRequest) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { auth, supabase } = result;

  let body;
  try { body = AutomationRunSchema.parse(await req.json()); }
  catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid body' }, { status: 400 });
  }

  const meta = AUTOMATIONS[body.automation];
  if (!meta) {
    return NextResponse.json(
      { error: `Unknown automation: ${body.automation}. Available: ${Object.keys(AUTOMATIONS).join(', ')}` },
      { status: 400 },
    );
  }
  if (meta.requiresEngagement && !body.engagement_id) {
    return NextResponse.json({ error: 'engagement_id is required for this automation' }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { error: 'Claude API not configured — set ANTHROPIC_API_KEY' },
      { status: 503 },
    );
  }

  // Validate client + engagement-belongs-to-client
  const { data: client } = await supabase
    .from('clients').select('*').eq('id', body.client_id).single();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  let engagement = null;
  if (body.engagement_id) {
    const { data: eng } = await supabase
      .from('engagements').select('*').eq('id', body.engagement_id).eq('client_id', body.client_id).maybeSingle();
    if (!eng) return NextResponse.json({ error: 'Engagement does not belong to this client' }, { status: 400 });
    engagement = eng;
  }

  let brandProfile = null;
  let brandSource = null;
  if (meta.usesBrandProfile) {
    const loaded = await getLatestBrandProfile(supabase, body.client_id);
    if (loaded) {
      brandProfile = loaded.profile;
      brandSource = loaded.source;
    }
  }

  // Create the job row synchronously so the client has an id to poll.
  const { data: job, error: jobErr } = await supabase
    .from('generation_jobs')
    .insert({
      engagement_id: body.engagement_id ?? null,
      type: meta.jobType,
      status: 'running',
    })
    .select('*')
    .single();
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  const prompt = buildPrompt(meta.promptType, engagement, client, brandProfile);

  // Fire-and-forget — use service role for the writeback since there's no
  // user session attached to the async Promise.
  void runInBackground({
    jobId: job.id,
    prompt,
    automation: body.automation,
    clientId: body.client_id,
    engagementId: body.engagement_id ?? null,
    jobType: meta.jobType,
    brandSource,
  });

  await audit({
    userId: auth.userId,
    action: 'run_automation',
    resourceType: 'automation_job',
    resourceId: job.id,
    metadata: {
      automation: body.automation,
      client_id: body.client_id,
      engagement_id: body.engagement_id ?? null,
      brand_profile_source: brandSource,
    },
    request: req,
  });

  return NextResponse.json({
    job_id: job.id,
    automation: body.automation,
    brand_profile_source: brandSource,
    status: 'running',
  });
}

async function runInBackground(opts: {
  jobId: number;
  prompt: string;
  automation: string;
  clientId: number | string;
  engagementId: number | string | null;
  jobType: string;
  brandSource: unknown;
}) {
  const sb = createServiceRoleClient();
  try {
    const { output } = await runPrompt(opts.prompt);
    await sb.from('generation_jobs').update({
      status: 'completed',
      output,
      completed_at: new Date().toISOString(),
    }).eq('id', opts.jobId);
    await sb.from('activities').insert({
      client_id: opts.clientId,
      engagement_id: opts.engagementId,
      type: 'system',
      content: `Generated ${opts.jobType} via automation`,
      metadata: {
        job_id: opts.jobId,
        automation: opts.automation,
        brand_profile_source: opts.brandSource,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb.from('generation_jobs').update({
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', opts.jobId);
    await sb.from('activities').insert({
      client_id: opts.clientId,
      engagement_id: opts.engagementId,
      type: 'system',
      content: `Automation ${opts.automation} failed: ${msg}`,
      metadata: { job_id: opts.jobId, automation: opts.automation },
    });
  }
}
