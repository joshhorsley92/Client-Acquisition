'use client';

// Sidebar navigation. Mirrors the prototype's Layout sidebar — Turnkey
// branding at top, nav links in the middle, signed-in user + sign-out
// at the bottom. Active link is highlighted via Next.js's usePathname.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const NAV_ITEMS: Array<{ href: string; label: string; icon: string }> = [
  { href: '/',             label: 'Home',     icon: '◉' },
  { href: '/clients',      label: 'Clients',  icon: '⌂' },
  { href: '/calls',        label: 'Calls',    icon: '☎' },
  { href: '/engagements',  label: 'Engagements', icon: '◆' },
  { href: '/automations',  label: 'Automations', icon: '✦' },
  { href: '/reports',      label: 'Reports',  icon: '▦' },
  { href: '/settings',     label: 'Settings', icon: '⚙' },
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

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <nav style={sidebarStyle}>
      <div style={brandStyle}>
        <span style={{ fontWeight: 'bold', fontSize: 18 }}>
          <span style={{ color: '#fff' }}>TURN</span>
          <span style={{ color: '#00D4AA' }}>KEY</span>
        </span>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>CRM</div>
      </div>

      <div style={{ flex: 1, padding: '8px 0' }}>
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 20px',
                color: active ? '#00D4AA' : '#94a3b8',
                background: active ? '#2A3A4E' : 'transparent',
                borderLeft: active ? '3px solid #00D4AA' : '3px solid transparent',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                textDecoration: 'none',
              }}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </Link>
          );
        })}
      </div>

      <div style={footerStyle}>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          {user.name || user.email}
        </div>
        {user.role && (
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
            {user.role}
          </div>
        )}
        <button
          onClick={signOut}
          style={{
            background: 'none', border: 'none', color: '#64748B',
            fontSize: 12, cursor: 'pointer', padding: '4px 0', marginTop: 6,
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 220,
  background: '#1B2838',
  color: '#fff',
  display: 'flex',
  flexDirection: 'column',
  padding: '20px 0',
  flexShrink: 0,
};
const brandStyle: React.CSSProperties = {
  padding: '0 20px 16px',
  borderBottom: '1px solid #2A3A4E',
};
const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #2A3A4E',
};
