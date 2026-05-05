// Server-side wrapper for the call detail. Fetches the call once on the
// server, hands off to the interactive CallDetailView for transcript edits,
// extraction, and apply-to-client.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireAuth, isAuthError } from '@/lib/api-auth';
import CallDetailView from '@/components/CallDetailView';

export default async function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { supabase } = result;
  const { id } = await params;

  const { data: call, error } = await supabase
    .from('call_recordings')
    .select('*, clients(name, email)')
    .eq('id', id)
    .single();
  if (error || !call) notFound();

  const flat = {
    ...call,
    client_name: (call as any).clients?.name,
    client_email: (call as any).clients?.email,
    clients: undefined,
  };

  return (
    <div>
      <Link href="/calls" className="text-brand-mint text-[13px] hover:underline">
        ← Back to calls
      </Link>
      <CallDetailView initialCall={flat} />
    </div>
  );
}
