'use client'

import { useState } from 'react'
import {
  Copy,
  Trash2,
  Megaphone,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
} from 'lucide-react'
import type { SavedLink } from './utm-constants'

interface SavedLinksSectionProps {
  savedLinks: SavedLink[]
  orgId: string
  onLinksChanged: () => void
}

export default function SavedLinksSection({ savedLinks, orgId, onLinksChanged }: SavedLinksSectionProps) {
  const [showSavedLinks, setShowSavedLinks] = useState(false)
  const [healthResults, setHealthResults] = useState<{ id: string; url: string; ok: boolean; status: number; channel_label?: string }[]>([])
  const [checkingHealth, setCheckingHealth] = useState(false)

  async function handleDeleteLink(id: string) {
    if (!confirm('Delete this saved link?')) return
    try {
      const res = await fetch(`/api/admin/utm?type=link&id=${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      onLinksChanged()
    } catch {
      // Error handling delegated to parent via onLinksChanged refresh
    }
  }

  async function handleHealthCheck() {
    if (!orgId) return
    setCheckingHealth(true)
    try {
      const res = await fetch('/api/admin/utm/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ org_id: orgId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHealthResults(data.results || [])
    } catch {
      // Health check errors are non-critical
    } finally {
      setCheckingHealth(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
  }

  if (savedLinks.length === 0) return null

  return (
    <div className="card">
      <button
        onClick={() => setShowSavedLinks(!showSavedLinks)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Megaphone size={18} className="text-brand-gray" />
          <h3 className="font-heading font-semibold text-brand-charcoal">
            Saved Links ({savedLinks.length})
          </h3>
        </div>
        {showSavedLinks ? <ChevronUp size={16} className="text-brand-gray" /> : <ChevronDown size={16} className="text-brand-gray" />}
      </button>

      {showSavedLinks && (
        <div className="flex items-center gap-2 mt-3 mb-1">
          <button
            onClick={handleHealthCheck}
            disabled={checkingHealth}
            className="text-xs text-brand-mint hover:text-brand-mint-dark flex items-center gap-1"
          >
            {checkingHealth ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            {checkingHealth ? 'Checking...' : 'Check Link Health'}
          </button>
          {healthResults.length > 0 && (
            <span className="text-[11px] text-brand-gray">
              {healthResults.filter(r => r.ok).length}/{healthResults.length} healthy
            </span>
          )}
        </div>
      )}

      {showSavedLinks && (
        <div className="mt-4 space-y-3">
          {savedLinks.map((link) => (
            <div key={link.id} className="bg-gray-50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                {healthResults.length > 0 && (() => {
                  const health = healthResults.find(r => r.id === link.id);
                  if (!health) return null;
                  return (
                    <div
                      className={'w-2 h-2 rounded-full shrink-0 mt-1 ' + (health.ok ? 'bg-emerald-500' : 'bg-red-500')}
                      title={health.ok ? 'Healthy (HTTP ' + health.status + ')' : 'Unhealthy (HTTP ' + health.status + ')'}
                    />
                  );
                })()}
                <code className="text-xs text-brand-charcoal break-all flex-1">{link.full_url}</code>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => copyToClipboard(link.full_url)}
                    className="text-brand-gray hover:text-brand-charcoal p-1"
                    title="Copy"
                    aria-label="Copy URL"
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    onClick={() => handleDeleteLink(link.id)}
                    className="text-brand-gray hover:text-red-500 p-1"
                    title="Delete"
                    aria-label="Delete link"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">{link.utm_source}</span>
                <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">{link.utm_medium}</span>
                <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 font-mono">{link.utm_campaign}</span>
                {link.channel_label && (
                  <span className="text-brand-gray ml-1">{link.channel_label}</span>
                )}
                <span className="text-brand-gray ml-auto">
                  {new Date(link.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
