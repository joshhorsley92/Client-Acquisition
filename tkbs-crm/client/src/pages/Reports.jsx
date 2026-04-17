import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Catches render errors in child components so a single broken chart
// doesn't blank the whole page.
class SectionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Reports section error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#FEE2E2', border: '1px solid #dc2626', color: '#dc2626',
          borderRadius: 8, padding: 16, marginBottom: 24, fontSize: 13,
        }}>
          <strong>Section crashed:</strong> {this.state.error.message || String(this.state.error)}
          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>Check the browser console for the full stack.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: '#1B2838', borderRadius: 8, padding: 20, textAlign: 'center',
    }}>
      <div style={{ color: color || '#00D4AA', fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function roiColor(roi) {
  if (roi == null) return '#94a3b8';
  if (roi >= 3) return '#00D4AA';
  if (roi >= 1) return '#E6A817';
  return '#dc2626';
}

function formatStage(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [funnel, setFunnel] = useState([]);
  const [sources, setSources] = useState([]);
  const [lostReasons, setLostReasons] = useState([]);
  const [velocity, setVelocity] = useState([]);
  const [conversion, setConversion] = useState([]);
  const [timeData, setTimeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load each endpoint independently so one failure doesn't blank the page
    const safe = (promise) => promise.catch((err) => { console.error('Report fetch failed:', err); return null; });
    Promise.all([
      safe(api.getReportSummary()),
      safe(api.getReportFunnel()),
      safe(api.getReportSources()),
      safe(api.getReportLostReasons()),
      safe(api.getReportVelocity()),
      safe(api.getReportTimeInvestment()),
    ]).then(([sumData, funnelData, srcData, lostData, velData, timeInvData]) => {
      if (sumData) setSummary(sumData.summary);
      if (funnelData) setFunnel(funnelData.funnel || []);
      if (srcData) setSources(srcData.sources || []);
      if (lostData) setLostReasons(lostData.reasons || []);
      if (velData) {
        setVelocity(velData.velocity || []);
        setConversion(velData.conversion || []);
      }
      if (timeInvData) setTimeData(timeInvData);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 40 }}>Loading reports...</div>;

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Reports</h1>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="Active Deals" value={summary.activeDeals} />
          <StatCard label="Pipeline Value" value={`$${Number(summary.pipelineValue).toLocaleString()}`} />
          <StatCard label="Win Rate" value={`${summary.winRate}%`} />
          <StatCard label="Avg Deal Cycle" value={summary.avgDealCycle ? `${summary.avgDealCycle}d` : '—'} />
        </div>
      )}

      {/* Pipeline Velocity Chart */}
      <SectionBoundary>
        {Array.isArray(velocity) && velocity.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 20, marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Average Days Per Stage</h3>
            <div style={{ width: '100%', height: Math.max(200, velocity.length * 48) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={velocity.map((v) => ({
                    name: formatStage(v.stage),
                    avg_days: Number(v.avg_days) || 0,
                    deal_count: v.deal_count,
                    stage: v.stage,
                  }))}
                  layout="vertical"
                  margin={{ left: 100, right: 40, top: 10, bottom: 10 }}
                >
                  <XAxis type="number" tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#1B2838' }} width={100} />
                  <Tooltip
                    formatter={(value) => [`${value} days`, 'Avg']}
                    contentStyle={{ fontSize: 12, borderRadius: 4 }}
                  />
                  <Bar dataKey="avg_days" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {velocity.map((entry, i) => (
                      <Cell key={`cell-${entry.stage}-${i}`} fill={entry.stage === 'closed_won' ? '#00D4AA' : '#1B2838'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              {velocity.map((v) => (
                <div key={v.stage} style={{ fontSize: 11, color: '#64748B' }}>
                  <strong style={{ color: '#1B2838' }}>{formatStage(v.stage)}:</strong> {v.avg_days}d avg ({v.deal_count} deals)
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionBoundary>

      {/* Stage Conversion */}
      <SectionBoundary>
        {Array.isArray(conversion) && conversion.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>Stage Conversion</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            {conversion.map((c, i) => (
              <React.Fragment key={i}>
                {i === 0 && (
                  <div style={{
                    padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                    background: '#1B2838', color: '#fff',
                  }}>
                    {formatStage(c.from)} ({c.from_count})
                  </div>
                )}
                <div style={{ fontSize: 12, color: c.rate >= 0.5 ? '#00D4AA' : '#E6A817', fontWeight: 700, padding: '0 4px' }}>
                  →{Math.round(c.rate * 100)}%→
                </div>
                <div style={{
                  padding: '8px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                  background: c.to === 'closed_won' ? '#E6FAF5' : '#F7F8FA',
                  color: c.to === 'closed_won' ? '#00D4AA' : '#1B2838',
                  border: `1px solid ${c.to === 'closed_won' ? '#00D4AA' : '#E2E6EB'}`,
                }}>
                  {formatStage(c.to)} ({c.to_count})
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
        )}
      </SectionBoundary>

      {/* Deal Profitability Table */}
      <SectionBoundary>
        {timeData && Array.isArray(timeData.deals) && (
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Deal Profitability</h3>
            {timeData.summary && (
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Total: {timeData.summary.total_hours}h across all deals · ${timeData.summary.hourly_rate}/hr rate
              </div>
            )}
          </div>

          <div style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid #E2E6EB' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1B2838', color: '#fff' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Company</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600 }}>Stage</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>Value</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>Hours</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>Cost</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>ROI</th>
                </tr>
              </thead>
              <tbody>
                {timeData.deals.map((d, i) => (
                  <tr key={d.deal_id} style={{ background: i % 2 === 0 ? '#fff' : '#F7F8FA' }}>
                    <td style={{ padding: '10px 16px', color: '#1B2838', fontWeight: 600 }}>
                      {d.company_name || `Deal #${d.deal_id}`}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#64748B' }}>
                      {formatStage(d.stage)}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: '#1B2838' }}>
                      {d.estimated_value ? `$${Number(d.estimated_value).toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: d.total_hours > 0 ? '#1B2838' : '#94a3b8' }}>
                      {d.total_hours > 0 ? `${d.total_hours}h` : '—'}
                      {d.tasks_with_time > 0 && (
                        <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>
                          ({d.tasks_with_time}/{d.tasks_total})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: d.cost_at_rate > 0 ? '#1B2838' : '#94a3b8' }}>
                      {d.cost_at_rate > 0 ? `$${d.cost_at_rate.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: roiColor(d.roi) }}>
                      {d.roi != null ? `${d.roi}x` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {timeData.summary && (
            <div style={{
              display: 'flex', gap: 24, marginTop: 12, fontSize: 12, color: '#64748B',
            }}>
              <div>Avg hours/deal: <strong style={{ color: '#1B2838' }}>{timeData.summary.avg_hours_per_deal}h</strong></div>
              <div>Avg hours/closed won: <strong style={{ color: '#1B2838' }}>{timeData.summary.avg_hours_per_closed_won}h</strong></div>
            </div>
          )}
        </div>
        )}
      </SectionBoundary>

      {/* Existing sections: funnel, sources, lost reasons, closed deals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Pipeline Funnel</h3>
          {funnel.map(f => (
            <div key={f.stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{formatStage(f.stage)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{f.count}</span>
            </div>
          ))}
          {funnel.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Deals by Source</h3>
          {sources.map(s => (
            <div key={s.source} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{s.source}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{s.count}</span>
            </div>
          ))}
          {sources.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No data yet.</div>}
        </div>

        <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Lost Deal Reasons</h3>
          {lostReasons.map(r => (
            <div key={r.lost_reason} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>{r.lost_reason}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{r.count}</span>
            </div>
          ))}
          {lostReasons.length === 0 && <div style={{ fontSize: 13, color: '#64748B' }}>No lost deals yet.</div>}
        </div>

        {summary && (
          <div style={{ background: '#fff', border: '1px solid #E2E6EB', borderRadius: 8, padding: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Closed Deals</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F7F8FA' }}>
              <span style={{ fontSize: 13 }}>Won</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#00D4AA' }}>{summary.totalWon}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ fontSize: 13 }}>Lost</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#E6A817' }}>{summary.totalLost}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
