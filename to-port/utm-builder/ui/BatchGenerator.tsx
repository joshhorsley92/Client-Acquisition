'use client'

import { useState } from 'react'
import {
  Layers,
  Copy,
  Check,
  Plus,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { BATCH_CHANNELS } from './utm-constants'
import type { BatchRow, LandingPage } from './utm-constants'

interface BatchGeneratorProps {
  landingPages: LandingPage[]
  selectedLpId: string
  customUrl: string
  utmCampaign: string
  orgId: string
  selectedCampaignId: string
  onSaved: () => void
}

export default function BatchGenerator({
  landingPages,
  selectedLpId,
  customUrl,
  utmCampaign,
  orgId,
  selectedCampaignId,
  onSaved,
}: BatchGeneratorProps) {
  const [batchRows, setBatchRows] = useState<BatchRow[]>(
    BATCH_CHANNELS.map(ch => ({ ...ch, term: '', content: '', enabled: true }))
  )
  const [batchResults, setBatchResults] = useState<{ label: string; url: string }[]>([])
  const [batchCopied, setBatchCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleBatchGenerate() {
    const baseUrl = selectedLpId
      ? landingPages.find(lp => lp.id === selectedLpId)?.url
      : customUrl

    if (!baseUrl) {
      setError('Select a landing page or enter a custom URL first')
      return
    }
    if (!utmCampaign) {
      setError('Campaign name is required for batch generation')
      return
    }
    if (!/^\d{4}-\d{2}-.+$/.test(utmCampaign)) {
      setError('Campaign must follow YYYY-MM-slug format')
      return
    }

    const enabledRows = batchRows.filter(r => r.enabled)
    if (enabledRows.length === 0) {
      setError('Enable at least one channel')
      return
    }

    const missingFields = enabledRows.filter(r => !r.term || !r.content)
    if (missingFields.length > 0) {
      setError(`Fill in term and content for: ${missingFields.map(r => r.label).join(', ')}`)
      return
    }

    try {
      const results = enabledRows.map(row => {
        const url = new URL(baseUrl)
        url.searchParams.set('utm_source', row.source)
        url.searchParams.set('utm_medium', row.medium)
        url.searchParams.set('utm_campaign', utmCampaign)
        url.searchParams.set('utm_term', row.term)
        url.searchParams.set('utm_content', row.content)
        return { label: row.label, url: url.toString() }
      })
      setBatchResults(results)
      setError(null)
    } catch {
      setError('Failed to generate URLs — check the landing page URL')
    }
  }

  async function handleBatchSaveAll() {
    if (!orgId || batchResults.length === 0) return
    setSaving(true)
    setError(null)
    try {
      for (const result of batchResults) {
        const row = batchRows.find(r => r.label === result.label)
        if (!row) continue
        await fetch('/api/admin/utm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'link',
            org_id: orgId,
            campaign_id: selectedCampaignId || null,
            landing_page_id: selectedLpId || null,
            full_url: result.url,
            utm_source: row.source,
            utm_medium: row.medium,
            utm_campaign: utmCampaign,
            utm_term: row.term,
            utm_content: row.content,
            channel_label: row.label,
          }),
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save batch links')
    } finally {
      setSaving(false)
    }
  }

  async function copyAllBatch() {
    const text = batchResults.map(r => r.label + '\n' + r.url).join('\n\n')
    await navigator.clipboard.writeText(text)
    setBatchCopied(true)
    setTimeout(() => setBatchCopied(false), 2000)
  }

  async function copySingleUrl(url: string) {
    await navigator.clipboard.writeText(url)
  }

  return (
    <>
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-brand-mint/10 flex items-center justify-center">
            <Layers size={14} className="text-brand-mint" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand-charcoal">All Channels</h2>
            <p className="text-xs text-brand-gray">Generate one link per channel — fill in term and content for each</p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}

        <div className="space-y-3">
          {batchRows.map((row, i) => (
            <div
              key={row.source}
              className={`p-3 rounded-lg border transition-colors ${row.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-50'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => {
                    const updated = [...batchRows]
                    updated[i] = { ...updated[i], enabled: e.target.checked }
                    setBatchRows(updated)
                  }}
                  className="rounded border-gray-300"
                />
                <span className="text-sm font-medium text-brand-charcoal">{row.label}</span>
                <span className="text-[11px] text-brand-gray font-mono">{row.source} / {row.medium}</span>
              </div>
              {row.enabled && (
                <div className="grid grid-cols-2 gap-2 ml-7">
                  <input
                    type="text"
                    value={row.term}
                    onChange={(e) => {
                      const updated = [...batchRows]
                      updated[i] = { ...updated[i], term: e.target.value.toLowerCase().replace(/\s/g, '-') }
                      setBatchRows(updated)
                    }}
                    placeholder={row.termHint}
                    className="input text-sm font-mono"
                  />
                  <input
                    type="text"
                    value={row.content}
                    onChange={(e) => {
                      const updated = [...batchRows]
                      updated[i] = { ...updated[i], content: e.target.value.toLowerCase().replace(/\s/g, '-') }
                      setBatchRows(updated)
                    }}
                    placeholder="creative-or-placement"
                    className="input text-sm font-mono"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleBatchGenerate}
        className="btn-primary w-full py-3 text-base font-medium flex items-center justify-center gap-2 mb-6"
      >
        <Layers size={18} />
        Generate All Links ({batchRows.filter(r => r.enabled).length} channels)
      </button>

      {/* Batch Results */}
      {batchResults.length > 0 && (
        <div className="card mb-6 border-brand-mint/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-brand-mint" />
              <h3 className="font-heading font-semibold text-brand-charcoal">
                Generated {batchResults.length} Links
              </h3>
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyAllBatch}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
              >
                {batchCopied ? <Check size={12} /> : <Copy size={12} />}
                {batchCopied ? 'Copied!' : 'Copy All'}
              </button>
              <button
                onClick={handleBatchSaveAll}
                disabled={saving}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Save All
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {batchResults.map((result) => (
              <div key={result.label} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-brand-charcoal">{result.label}</span>
                  <button
                    onClick={() => copySingleUrl(result.url)}
                    className="text-brand-gray hover:text-brand-charcoal"
                  >
                    <Copy size={13} />
                  </button>
                </div>
                <code className="text-xs text-brand-gray break-all">{result.url}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
