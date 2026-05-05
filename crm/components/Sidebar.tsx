'use client';

// Sidebar navigation. Branding at top, nav links in the middle, signed-in
// user + sign-out at the bottom. Active link highlighted via usePathname.

import Link from 'next/link';
import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Home,
  Building2,
  Phone,
  Briefcase,
  BarChart3,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase-browser';
import ConfirmDialog from '@/components/ConfirmDialog';
import { cn } from '@/lib/cn';

const NAV_ITEMS: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: '/',            label: 'Home',        Icon: Home },
  { href: '/clients',     label: 'Clients',     Icon: Building2 },
  { href: '/calls',       label: 'Calls',       Icon: Phone },
  { href: '/engagements', label: 'Engagements', Icon: Briefcase },
  { href: '/reports',     label: 'Reports',     Icon: BarChart3 },
  { href: '/settings',    label: 'Settings',    Icon: SettingsIcon },
];

export interface SidebarUser {
  name?: string;
  email?: string;
  role?: string;
}

export default function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav className="w-[220px] bg-brand-charcoal text-white flex flex-col py-5 flex-shrink-0">
      <div className="px-5 pb-4 border-b border-white/10">
        <span className="font-bold text-lg">
          <span className="text-white">TURN</span>
          <span className="text-brand-mint">KEY</span>
        </span>
        <div className="text-[11px] text-brand-gray mt-0.5">CRM</div>
      </div>

      <div className="flex-1 py-2">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-2.5 px-5 py-2.5 text-sm border-l-[3px]',
                'transition-colors',
                active
                  ? 'text-brand-mint bg-white/5 border-l-brand-mint font-semibold'
                  : 'text-brand-gray-light border-l-transparent hover:text-white hover:bg-white/5',
              )}
            >
              <Icon size={16} strokeWidth={active ? 2.25 : 2} />
              {label}
            </Link>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-white/10">
        <div className="text-[13px] text-brand-gray-light truncate">
          {user.name || user.email}
        </div>
        {user.role && (
          <div className="text-[11px] text-brand-gray mt-0.5 capitalize">
            {user.role}
          </div>
        )}
        <button
          onClick={() => setConfirmingSignOut(true)}
          className="bg-transparent border-none text-brand-gray text-xs cursor-pointer py-1 mt-1.5 hover:text-white"
        >
          Sign out
        </button>
      </div>

      <ConfirmDialog
        open={confirmingSignOut}
        title="Sign out?"
        body="You'll be returned to the sign-in page."
        confirmLabel="Sign out"
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={signOut}
      />
    </nav>
  );
}
