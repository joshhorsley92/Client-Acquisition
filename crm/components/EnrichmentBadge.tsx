// Small status pill used on Client list rows + Client detail page.
// Returns null for the 'none' state so unenriched clients don't get a badge.

export default function EnrichmentBadge({ status }: { status?: string | null }) {
  if (!status || status === 'none') return null;
  const tone =
    status === 'running' ? { bg: '#FFF8E6', color: '#A16207', border: '#FCD34D', label: 'Enriching…' }
    : status === 'succeeded' ? { bg: '#E6FAF5', color: '#047857', border: '#6EE7B7', label: 'Enriched' }
    : status === 'failed' ? { bg: '#FEF2F2', color: '#991b1b', border: '#FCA5A5', label: 'Enrichment failed' }
    : null;
  if (!tone) return null;
  return (
    <span style={{
      fontSize: 10, padding: '1px 6px', borderRadius: 8, fontWeight: 600,
      background: tone.bg, color: tone.color, border: `1px solid ${tone.border}`,
      marginLeft: 8, whiteSpace: 'nowrap',
    }}>
      {tone.label}
    </span>
  );
}
