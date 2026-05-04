// POST /api/engagements/:id/generate — kick off a Claude proposal/AI-content
// generation job. Old impl used the local @anthropic-ai/claude-code CLI as a
// subprocess. v1.0 uses the Anthropic SDK directly so it works inside a
// Netlify Function. Returns immediately; client polls /generation-status.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import { createServiceRoleClient } from '@/lib/supabase-server';

const Body = z.object({
  prompt_type: z.string().optional(),
});

const MODEL = 'claude-sonnet-4-6'; // fast + cheap; bump to opus for higher-stakes work

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return result;
  const { supabase } = result;
  const { id } = await ctx.params;

  const { data: engagement, error: engErr } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (engErr || !engagement) {
    return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set on the server.' },
      { status: 503 },
    );
  }

  let body;
  try { body = Body.parse(await req.json().catch(() => ({}))); }
  catch { body = {}; }

  // Insert a generation_jobs row in 'running' state so the UI can poll.
  const { data: job, error: jobErr } = await supabase
    .from('generation_jobs')
    .insert({ engagement_id: Number(id), type: 'ai_content', status: 'running' })
    .select('*')
    .single();
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  // Fire-and-forget: respond immediately, do the Claude call in the background.
  // The service-role client bypasses RLS so we can write the result back from
  // the async path even though there's no user session attached to this Promise.
  void runGenerationInBackground(job.id, engagement, body.prompt_type);

  return NextResponse.json({ status: 'started', job });
}

async function runGenerationInBackground(
  jobId: number,
  engagement: any,
  promptType?: string,
) {
  const sb = createServiceRoleClient();
  try {
    const { data: client } = await sb
      .from('clients').select('*').eq('id', engagement.client_id).single();

    // Stub prompt builder — real prompts come from the ported ai-prompts service.
    // For v1.0 scaffolding, this proves the Anthropic SDK + DB write-back works.
    const prompt = `You are writing for ${client?.name || 'a TKBS prospect'} in the ${engagement.status} engagement stage. Generate a brief proposal outline covering scope, timeline, and investment.`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const output = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n');

    await sb.from('generation_jobs').update({
      status: 'completed',
      output,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  } catch (err) {
    await sb.from('generation_jobs').update({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      completed_at: new Date().toISOString(),
    }).eq('id', jobId);
  }
}
