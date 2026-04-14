import React from 'react';
import { useNavigate } from 'react-router-dom';

function fitBadgeStyle(score) {
  if (score == null) {
    return { bg: '#F7F8FA', color: '#94a3b8', border: '#E2E6EB', label: '—', tier: '' };
  }
  if (score >= 70) return { bg: '#E6FAF5', color: '#00D4AA', border: '#00D4AA', label: String(score), tier: 'High fit' };
  if (score >= 40) return { bg: '#FFF3E0', color: '#E6A817', border: '#E6A817', label: String(score), tier: 'Mid fit' };
  return { bg: '#FEE2E2', color: '#dc2626', border: '#dc2626', label: String(score), tier: 'Low fit' };
}

function fitTooltip(deal) {
  if (deal.fit_score == null) return 'Fit score not yet computed';
  let tier = 'Low fit';
  if (deal.fit_score >= 70) tier = 'High fit';
  else if (deal.fit_score >= 40) tier = 'Mid fit';
  try {
    const raw = deal.fit_score_breakdown;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const b = parsed && (parsed.breakdown || parsed);
    if (b && b.icp_match && b.readiness_signals && b.engagement) {
      return `${tier} · ICP ${b.icp_match.score}/${b.icp_match.max} · Readiness ${b.readiness_signals.score}/${b.readiness_signals.max} · Engagement ${b.engagement.score}/${b.engagement.max}`;
    }
  } catch (e) {}
  return `${tier} · ${deal.fit_score}/100`;
}

export default function DealCard({ deal, provided }) {
  const navigate = useNavigate();
  const daysInStage = Math.floor((Date.now() - new Date(deal.stage_entered_at).getTime()) / 86400000);
  const isStale = daysInStage > 21;
  const fit = fitBadgeStyle(deal.fit_score);

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deal.company_name || 'No Company'}
        </div>
        <span
          title={fitTooltip(deal)}
          style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: fit.bg, color: fit.color, border: `1px solid ${fit.border}`,
            flexShrink: 0, lineHeight: '14px',
          }}
        >
          {fit.label}
        </span>
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
