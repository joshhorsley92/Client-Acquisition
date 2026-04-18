import React from 'react';
import { useParams, Link } from 'react-router-dom';

// Phase 3A stub. Real implementation lands in Phase 3B with tabs:
// Overview, Engagements, Calls, Scripts, Activity.

export default function ClientDetail() {
  const { id } = useParams();
  return (
    <div style={{ maxWidth: 720 }}>
      <Link to="/clients" style={{ color: '#00D4AA', fontSize: 14 }}>← All clients</Link>
      <h1 style={{ fontSize: 24, margin: '12px 0 8px' }}>Client #{id}</h1>
      <div style={{
        padding: 24, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        color: '#475569', lineHeight: 1.6,
      }}>
        <p style={{ margin: 0, fontWeight: 600, color: '#0f172a' }}>Coming in Phase 3B.</p>
        <p style={{ marginTop: 12, marginBottom: 0 }}>
          Tabs planned: Overview · Engagements · Calls · Scripts · Activity.
        </p>
      </div>
    </div>
  );
}
