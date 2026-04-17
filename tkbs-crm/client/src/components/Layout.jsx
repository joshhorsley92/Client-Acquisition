import React, { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../App';
import GlobalSearch from './GlobalSearch';

const navItems = [
  { to: '/', label: 'Home', icon: '◉' },
  { to: '/pipeline', label: 'Pipeline', icon: '◫' },
  { to: '/import', label: 'Import', icon: '⬆' },
  { to: '/tasks', label: 'Tasks', icon: '☑' },
  { to: '/contacts', label: 'Contacts', icon: '☻' },
  { to: '/companies', label: 'Companies', icon: '⌂' },
  { to: '/calls', label: 'Calls', icon: '☎' },
  { to: '/scripts', label: 'Scripts', icon: '✎' },
  { to: '/reports', label: 'Reports', icon: '▦' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav style={{
        width: 220,
        background: '#1B2838',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 0',
        flexShrink: 0,
      }}>
        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid #2A3A4E' }}>
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>
            <span style={{ color: '#fff' }}>TURN</span>
            <span style={{ color: '#00D4AA' }}>KEY</span>
          </span>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>CRM</div>
        </div>

        {/* Search trigger */}
        <button
          onClick={() => setSearchOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            margin: '12px 12px 4px', padding: '8px 12px',
            background: '#2A3A4E', border: 'none', borderRadius: 4,
            color: '#94a3b8', fontSize: 13, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 14 }}>🔍</span>
          <span style={{ flex: 1 }}>Search...</span>
          <span style={{ fontSize: 11, color: '#64748B', background: '#1B2838', padding: '1px 6px', borderRadius: 3 }}>⌘K</span>
        </button>

        <div style={{ flex: 1, padding: '8px 0' }}>
          {navItems.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                color: isActive ? '#00D4AA' : '#94a3b8',
                background: isActive ? '#2A3A4E' : 'transparent',
                borderLeft: isActive ? '3px solid #00D4AA' : '3px solid transparent',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
              })}
            >
              <span style={{ fontSize: 16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #2A3A4E' }}>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>{user?.name}</div>
          <button
            onClick={logout}
            style={{
              background: 'none', border: 'none', color: '#64748B',
              fontSize: 12, cursor: 'pointer', padding: '4px 0', marginTop: 4,
            }}
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
        <Outlet />
      </main>

      {/* Global search modal */}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
