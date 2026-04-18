'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import type { Campaign } from './utm-constants'

interface CampaignSelectorProps {
  campaigns: Campaign[]
  selectedCampaignId: string
  utmCampaign: string
  onSelectCampaign: (id: string) => void
  onCampaignChange: (slug: string) => void
  onCampaignAdded: () => void
  orgId: string
  validationErrors: { field: string; message: string }[]
}

function getFieldError(errors: { field: string; message: string }[], field: string): string | undefined {
  return errors.find(e => e.field === field)?.message
}

export default function CampaignSelector({
  campaigns,
  selectedCampaignId,
  utmCampaign,
  onSelectCampaign,
  onCampaignChange,
  onCampaignAdded,
  orgId,
  validationErrors,
}: CampaignSelectorProps) {
  const [showNewCampaign, setShowNewCampaign] = useState(false)
  const [newCampaignSlug, setNewCampaignSlug] = useState('')
  const [newCampaignDesc, setNewCampaignDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAddCampaign() {
    if (!newCampaignSlug || !orgId) return

    // Validate campaign slug format
    if (!/^\d{4}-\d{2}-.+$/.test(newCampaignSlug)) {
      setError('Campaign slug must follow YYYY-MM-slug format')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/utm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'campaign',
          org_id: orgId,
          campaign_slug: newCampaignSlug.toLowerCase(),
          description: newCampaignDesc || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowNewCampaign(false)
      setNewCampaignSlug('')
      setNewCampaignDesc('')
      onCampaignAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign')
    } finally {
      setSaving(false)
    }
  }

  const campaignError = getFieldError(validationErrors, 'utm_campaign')

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-mint/10 flex items-center justify-center text-sm font-bold text-brand-mint">3</div>
          <h2 className="font-heading text-lg font-semibold text-brand-charcoal">Campaign</h2>
        </div>
        <button
          onClick={() => setShowNewCampaign(!showNewCampaign)}
          className="text-sm text-brand-mint hover:text-brand-mint-dark flex items-center gap-1"
        >
          <Plus size={14} />
          New Campaign
        </button>
      </div>

      {/* New campaign form */}
      {showNewCampaign && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
          <div>
            <label className="block text-xs font-medium text-brand-charcoal mb-1">Campaign Slug *</label>
            <input
              type="text"
              value={newCampaignSlug}
              onChange={(e) => setNewCampaignSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="2026-04-spring-launch"
              className="input w-full text-sm font-mono"
            />
            <p className="text-[11px] text-brand-gray mt-1">Format: YYYY-MM-description (e.g. 2026-04-spring-launch)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-charcoal mb-1">Description</label>
            <input
              type="text"
              value={newCampaignDesc}
              onChange={(e) => setNewCampaignDesc(e.target.value)}
              placeholder="What is this campaign about?"
              className="input w-full text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNewCampaign(false)} className="text-xs text-brand-gray hover:text-brand-charcoal">Cancel</button>
            <button
              onClick={handleAddCampaign}
              disabled={saving || !newCampaignSlug}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {campaigns.filter(c => c.is_active).length > 0 ? (
        <select
          value={selectedCampaignId}
          onChange={(e) => onSelectCampaign(e.target.value)}
          className="input w-full mb-2"
        >
          <option value="">Select an existing campaign...</option>
          {campaigns.filter(c => c.is_active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.campaign_slug}{c.description ? ` — ${c.description}` : ''}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-sm text-brand-gray mb-2">No campaigns yet. Create one above or enter a campaign name manually below.</p>
      )}

      <div>
        <label className="block text-xs font-medium text-brand-gray mb-1">Campaign Name <span className="text-[10px] text-brand-gray/60">Which campaign is this for?</span></label>
        <input
          type="text"
          value={utmCampaign}
          onChange={(e) => {
            onCampaignChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
          }}
          placeholder="2026-04-campaign-name"
          className={`input w-full text-sm font-mono ${campaignError ? 'border-red-300' : ''}`}
        />
        {campaignError && (
          <p className="text-xs text-red-600 mt-1">{campaignError}</p>
        )}
      </div>
    </div>
  )
}
