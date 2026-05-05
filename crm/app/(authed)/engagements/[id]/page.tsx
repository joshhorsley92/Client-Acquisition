// Engagement detail — server-rendered shell. Fetches engagement + client +
// linked calls + generation jobs + activities, then hands off to
// EngagementDetailClient for the interactive (inline-edit) UI.

import { notFound } from 'next/navigation';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import EngagementDetailClient from '@/components/EngagementDetailClient';

export default async function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;
  const { id } = await params;

  const { data: engagement, error } = await supabase
    .from('engagements').select('*').eq('id', id).single();
  if (error || !engagement) notFound();

  const [{ data: client }, { data: calls }, { data: jobs }, { data: activities }] = await Promise.all([
    supabase.from('clients')
      .select('id, name, industry, location, website, phone, email')
      .eq('id', engagement.client_id).single(),
    supabase.from('call_recordings')
      .select('id, call_date, duration_minutes, transcript_source, review_status, audio_storage_path, extracted_profile_json, created_at')
      .eq('engagement_id', id)
      .order('call_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('generation_jobs')
      .select('id, type, status, output, error, started_at, completed_at')
      .eq('engagement_id', id)
      .order('started_at', { ascending: false }),
    supabase.from('activities')
      .select('id, type, content, created_at')
      .eq('engagement_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <EngagementDetailClient
      initialEngagement={engagement as any}
      client={(client as any) || null}
      calls={(calls as any) || []}
      jobs={(jobs as any) || []}
      activities={(activities as any) || []}
    />
  );
}
