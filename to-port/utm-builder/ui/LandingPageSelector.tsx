'use client'

import { useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import type { LandingPage, ValidationError } from './utm-constants'

function getFieldError(errors: ValidationError[], field: string): string | undefined {
  return errors.find(e => e.field === field)?.message
}

interface LandingPageSelectorProps {
  landingPages: LandingPage[]
  selectedLpId: string
  customUrl: string
  onSelectLp: (id: string) => void
  onCustomUrlChange: (url: string) => void
  onLandingPageAdded: () => void
  orgId: string
  validationErrors: ValidationError[]
}

export default function LandingPageSelector({
  landingPages,
  selectedLpId,
  customUrl,
  onSelectLp,
  onCustomUrlChange,
  onLandingPageAdded,
  orgId,
  validationErrors,
}: LandingPageSelectorProps) {
  const [showNewLp, setShowNewLp] = useState(false)
  const [newLpUrl, setNewLpUrl] = useState('')
  const [newLpLabel, setNewLpLabel] = useState('')
  const [newLpPrimary, setNewLpPrimary] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAddLandingPage() {
    if (!newLpUrl || !newLpLabel || !orgId) return

    setSaving(true)
    try {
      const res = await fetch('/api/admin/utm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'landing_page',
          org_id: orgId,
          url: newLpUrl,
          label: newLpLabel,
          is_primary: newLpPrimary,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowNewLp(false)
      setNewLpUrl('')
      setNewLpLabel('')
      setNewLpPrimary(false)
      onLandingPageAdded()
    } catch {
      // Error will surface through parent refresh
    } finally {
      setSaving(false)
    }
  }

  const urlError = getFieldError(validationErrors, 'url')

  return (
    <div className="card mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-brand-mint/10 flex items-center justify-center text-sm font-bold text-brand-mint">2</div>
          <h2 className="font-heading text-lg font-semibold text-brand-charcoal">Website URL</h2>
        </div>
        <button
          onClick={() => setShowNewLp(!showNewLp)}
          className="text-sm text-brand-mint hover:text-brand-mint-dark flex items-center gap-1"
        >
          <Plus size={14} />
          Add New
        </button>
      </div>

      {/* New LP form */}
      {showNewLp && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-brand-charcoal mb-1">Label *</label>
              <input
                type="text"
                value={newLpLabel}
                onChange={(e) => setNewLpLabel(e.target.value)}
                placeholder="e.g. Main Discovery Call"
                className="input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-brand-charcoal mb-1">URL *</label>
              <input
                type="url"
                value={newLpUrl}
                onChange={(e) => setNewLpUrl(e.target.value)}
                placeholder="https://example.com/landing-page/"
                className="input w-full text-sm"
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-brand-gray">
              <input
                type="checkbox"
                checked={newLpPrimary}
                onChange={(e) => setNewLpPrimary(e.target.checked)}
                className="rounded border-gray-300"
              />
              Set as primary landing page
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowNewLp(false)} className="text-xs text-brand-gray hover:text-brand-charcoal">Cancel</button>
              <button
                onClick={handleAddLandingPage}
                disabled={saving || !newLpUrl || !newLpLabel}
                className="btn-primary text-xs px-3 py-1.5"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {landingPages.length > 0 ? (
        <div className="space-y-2 mb-3">
          {landingPages.map((lp) => (
            <label
              key={lp.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedLpId === lp.id
                  ? 'border-brand-mint bg-brand-mint/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="landing_page"
                value={lp.id}
                checked={selectedLpId === lp.id}
                onChange={() => { onSelectLp(lp.id); onCustomUrlChange('') }}
                className="text-brand-mint"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-brand-charcoal">{lp.label}</span>
                  {lp.is_primary && (
                    <span className="text-[10px] bg-brand-mint/10 text-brand-mint px-1.5 py-0.5 rounded-full font-medium">PRIMARY</span>
                  )}
                </div>
                <span className="text-xs text-brand-gray truncate block">{lp.url}</span>
              </div>
            </label>
          ))}
        </div>
      ) : null}

      <div className="border-t border-gray-100 pt-3">
        <label className="block text-xs font-medium text-brand-gray mb-1">Or enter a custom URL:</label>
        <input
          type="url"
          value={customUrl}
          onChange={(e) => { onCustomUrlChange(e.target.value); onSelectLp('') }}
          placeholder="https://custom-landing-page.com/"
          className={`input w-full text-sm ${urlError ? 'border-red-300' : ''}`}
        />
        {urlError && (
          <p className="text-xs text-red-600 mt-1">{urlError}</p>
        )}
      </div>
    </div>
  )
}
