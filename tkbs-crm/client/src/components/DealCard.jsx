import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function DealCard({ deal, provided }) {
  const navigate = useNavigate();
  const daysInStage = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / 86400000);
  const isStale = daysInStage > 21;

  return (
    <div
      ref={provided.innerRef}
      {...provided.draggableProps}
      {...provided.dragHandleProps}
      onClick={() => navigate(`/deals/${deal.id}`)}
      style={{
        background: '#fff',
        border: `1px solid ${isStale ? '#E6A817' : '#E2E6EB'}`,
        borderRadius: 6,
        padding: 12,
        marginBottom: 8,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        ...provided.draggableProps.style,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
        {deal.company_name || 'No Company'}
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
        {deal.contact_name || 'No Contact'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 11, color: '#fff', background: '#00D4AA', borderRadius: 10,
          padding: '2px 8px', fontWeight: 600,
        }}>
          {deal.estimated_value ? `$${Number(deal.estimated_value).toLocaleString()}/mo` : '—'}
        </span>
        <span style={{
          fontSize: 11,
          color: isStale ? '#E6A817' : '#64748B',
          fontWeight: isStale ? 600 : 400,
        }}>
          {daysInStage}d
        </span>
      </div>
      {deal.source && (
        <div style={{
          fontSize: 10, color: '#64748B', marginTop: 6,
          background: '#F7F8FA', borderRadius: 3, padding: '2px 6px', display: 'inline-block',
        }}>
          {deal.source}
        </div>
      )}
    </div>
  );
}
