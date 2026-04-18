import React from 'react';

// Phase 3A stub. Real implementation lands in Phase 3B:
// filterable table, status tabs, LTV sort, "+ New Client" modal that kicks
// off background enrichment when a website is provided.

export default function Clients() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Clients</h1>
      <div style={{
        padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        color: '#475569', lineHeight: 1.6,
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>Coming in Phase 3B.</p>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          The backend is live — try <code>GET /api/clients</code>, <code>POST /api/clients</code>,
          and <code>POST /api/enrichment/run</code> directly while we build the UI.
        </p>
      </div>
    </div>
  );
}
