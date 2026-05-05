// Server-side wrapper for the client detail. Fetches the client +
// engagements once on the server, then hands off to the interactive
// ClientDetailView (client component) for tabs + edits.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import ClientDetailView from '@/components/ClientDetailView';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;
  const { id } = await params;

  const { data: client, error } = await supabase
    .from('clients').select('*').eq('id', id).single();
  if (error || !client) notFound();

  const [{ data: engagements }, { data: activities }, { data: calls }] = await Promise.all([
    supabase.from('engagements').select('*').eq('client_id', id).order('opened_at', { ascending: false }),
    supabase.from('activities').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('call_recordings').select('id, call_date, transcript_source, review_status, created_at')
      .eq('client_id', id).order('created_at', { ascending: false }).limit(50),
  ]);

  return (
    <div>
      <Link href="/clients" className="text-brand-mint text-[13px] hover:underline">
        ← Back to clients
      </Link>
      <ClientDetailView
        initialClient={client}
        initialEngagements={engagements || []}
        initialActivities={activities || []}
        initialCalls={calls || []}
      />
    </div>
  );
}
