import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../App';

const navItems = [
  { to: '/', label: 'Pipeline', icon: '◫' },
  { to: '/tasks', label: 'Tasks', icon: '☑' },
  { to: '/contacts', label: 'Contacts', icon: '☻' },
  { to: '/companies', label: 'Companies', icon: '⌂' },
  { to: '/scripts', label: 'Scripts', icon: '✎' },
];

export default function Layout() {
  const { user, logout } = useAuth();

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
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #2A3A4E' }}>
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>
            <span style={{ color: '#fff' }}>TURN</span>
            <span style={{ color: '#00D4AA' }}>KEY</span>
          </span>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>CRM</div>
        </div>

        <div style={{ flex: 1, padding: '12px 0' }}>
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
    </div>
  );
}
