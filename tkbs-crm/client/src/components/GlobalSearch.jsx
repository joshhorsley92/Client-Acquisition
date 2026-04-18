import React, { useEffect, useRef } from 'react';

// Phase 3A placeholder. The backend's /api/search route is unmounted until
// it's repointed at clients+engagements in Phase 3B. Rather than let this
// modal call a dead endpoint and log console errors, it now shows a short
// "coming soon" notice. Ctrl+K still opens and Esc still closes.

export default function GlobalSearch({ open, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 140,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: 520,
          background: '#fff',
          borderRadius: 8,
          border: '1px solid #E2E6EB',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          padding: '24px 28px',
          color: '#1B2838',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Search is getting rebuilt
        </div>
        <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.5 }}>
          Cross-entity search is coming back in Phase 3B — it'll search across
          clients and engagements instead of the old companies/contacts/deals
          triplet.
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
          Press <b style={{ color: '#64748B' }}>Esc</b> to close.
        </div>
      </div>
    </div>
  );
}
