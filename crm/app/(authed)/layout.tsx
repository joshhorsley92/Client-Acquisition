// Shared layout for every authenticated page. The route-group folder
// `(authed)` doesn't appear in URLs — it's just a Next.js convention for
// grouping pages under a common layout. Login lives outside this group
// so it doesn't get the sidebar.

import { requireAuth, isAuthError } from '@/lib/api-auth';
import Sidebar from '@/components/Sidebar';

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const result = await requireAuth();
  if (isAuthError(result)) return null;
  const { auth } = result;

  return (
    <div className="flex min-h-screen">
      <Sidebar user={{ name: auth.name, role: auth.role }} />
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
