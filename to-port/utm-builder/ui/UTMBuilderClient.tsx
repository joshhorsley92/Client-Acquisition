'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Link2,
  Plus,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Layers,
  Bookmark,
} from 'lucide-react'

import {
  APPROVED_SOURCES,
  APPROVED_MEDIUMS,
  SOURCE_MEDIUM_MAP,
  loadTemplates,
  saveTemplates as persistTemplates,
} from './utm-constants'
import type {
  Organization,
  LandingPage,
  Campaign,
  SavedLink,
  SavedTemplate,
  ValidationError,
} from './utm-constants'

import TemplatesDropdown from './TemplatesDropdown'
import LandingPageSelector from './LandingPageSelector'
import CampaignSelector from './CampaignSelector'
import BatchGenerator from './BatchGenerator'
import SavedLinksSection from './SavedLinksSection'

export default function UTMBuilderClient() {
  // Organization selection
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState('')

  // Organization UTM data
  const [landingPages, setLandingPages] = useState<LandingPage[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([])

  // Form state
  const [selectedLpId, setSelectedLpId] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmTerm, setUtmTerm] = useState('')
  const [utmContent, setUtmContent] = useState('')
  const [channelLabel, setChannelLabel] = useState('')
  const [notes, setNotes] = useState('')

  // Generated URL
  const [generatedUrl, setGeneratedUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // UI state
  const [loading, setLoading] = useState(true)
  const [loadingUtm, setLoadingUtm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  // Mode: 'single' or 'batch'
  const [mode, setMode] = useState<'single' | 'batch'>('single')

  // Templates
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')

  // Load templates from localStorage
  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  // Fetch organizations
  useEffect(() => {
    async function fetchOrgs() {
      try {
        const res = await fetch('/api/organizations')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setOrganizations(data.organizations || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load organizations')
      } finally {
        setLoading(false)
      }
    }
    fetchOrgs()
  }, [])

  // Fetch UTM data when org changes
  const fetchUtmData = useCallback(async (orgId: string) => {
    if (!orgId) {
      setLandingPages([])
      setCampaigns([])
      setSavedLinks([])
      return
    }
    setLoadingUtm(true)
    try {
      const res = await fetch(`/api/admin/utm?org_id=${orgId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setLandingPages(data.landing_pages || [])
      setCampaigns(data.campaigns || [])
      setSavedLinks(data.links || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load UTM data')
    } finally {
      setLoadingUtm(false)
    }
  }, [])

  useEffect(() => {
    if (selectedOrgId) {
      fetchUtmData(selectedOrgId)
      // Reset form when org changes
      setSelectedLpId('')
      setCustomUrl('')
      setSelectedCampaignId('')
      setUtmSource('')
      setUtmMedium('')
      setUtmCampaign('')
      setUtmTerm('')
      setUtmContent('')
      setGeneratedUrl('')
    }
  }, [selectedOrgId, fetchUtmData])

  // Auto-suggest medium when source changes
  useEffect(() => {
    if (utmSource && SOURCE_MEDIUM_MAP[utmSource]) {
      const suggested = SOURCE_MEDIUM_MAP[utmSource]
      if (suggested.length === 1) {
        setUtmMedium(suggested[0])
      }
    }
  }, [utmSource])

  // Sync campaign slug from selected campaign
  useEffect(() => {
    if (selectedCampaignId) {
      const campaign = campaigns.find(c => c.id === selectedCampaignId)
      if (campaign) {
        setUtmCampaign(campaign.campaign_slug)
      }
    }
  }, [selectedCampaignId, campaigns])

  // ============================================================
  // VALIDATION — enforces docs/UTM-CONVENTIONS.md
  // ============================================================

  function validate(): ValidationError[] {
    const errors: ValidationError[] = []

    // Base URL
    const baseUrl = selectedLpId
      ? landingPages.find(lp => lp.id === selectedLpId)?.url
      : customUrl
    if (!baseUrl) {
      errors.push({ field: 'url', message: 'Landing page URL is required' })
    } else {
      try { new URL(baseUrl) } catch {
        errors.push({ field: 'url', message: 'Invalid URL format' })
      }
    }

    // All 5 params required
    if (!utmSource) errors.push({ field: 'utm_source', message: 'Source is required' })
    if (!utmMedium) errors.push({ field: 'utm_medium', message: 'Medium is required' })
    if (!utmCampaign) errors.push({ field: 'utm_campaign', message: 'Campaign is required' })
    if (!utmTerm) errors.push({ field: 'utm_term', message: 'Term is required' })
    if (!utmContent) errors.push({ field: 'utm_content', message: 'Content is required' })

    // Approved source
    if (utmSource && !APPROVED_SOURCES.find(s => s.value === utmSource)) {
      errors.push({ field: 'utm_source', message: `"${utmSource}" is not an approved source. Update UTM-CONVENTIONS.md first.` })
    }

    // Approved medium
    if (utmMedium && !APPROVED_MEDIUMS.find(m => m.value === utmMedium)) {
      errors.push({ field: 'utm_medium', message: `"${utmMedium}" is not an approved medium. Update UTM-CONVENTIONS.md first.` })
    }

    // Campaign format: YYYY-MM-slug
    if (utmCampaign) {
      if (!/^\d{4}-\d{2}-.+$/.test(utmCampaign)) {
        errors.push({ field: 'utm_campaign', message: 'Campaign must follow YYYY-MM-slug format (e.g. 2026-04-spring-launch)' })
      }
      if (utmCampaign !== utmCampaign.toLowerCase()) {
        errors.push({ field: 'utm_campaign', message: 'Campaign must be lowercase' })
      }
      if (/_/.test(utmCampaign)) {
        errors.push({ field: 'utm_campaign', message: 'Use hyphens, not underscores' })
      }
    }

    // General format rules for term and content
    for (const [field, value] of [['utm_term', utmTerm], ['utm_content', utmContent]] as const) {
      if (value) {
        if (value !== value.toLowerCase()) {
          errors.push({ field, message: 'Must be lowercase' })
        }
        if (/_/.test(value)) {
          errors.push({ field, message: 'Use hyphens, not underscores' })
        }
        if (/\s/.test(value)) {
          errors.push({ field, message: 'No spaces — use hyphens' })
        }
      }
    }

    return errors
  }

  function buildUrl(): string | null {
    const baseUrl = selectedLpId
      ? landingPages.find(lp => lp.id === selectedLpId)?.url
      : customUrl

    if (!baseUrl) return null

    try {
      const url = new URL(baseUrl)
      url.searchParams.set('utm_source', utmSource)
      url.searchParams.set('utm_medium', utmMedium)
      url.searchParams.set('utm_campaign', utmCampaign)
      url.searchParams.set('utm_term', utmTerm)
      url.searchParams.set('utm_content', utmContent)
      return url.toString()
    } catch {
      return null
    }
  }

  function handleGenerate() {
    const errors = validate()
    setValidationErrors(errors)
    if (errors.length > 0) {
      setError(`${errors.length} validation error${errors.length > 1 ? 's' : ''} — check the fields below`)
      return
    }

    const url = buildUrl()
    if (url) {
      setGeneratedUrl(url)
      setError(null)
    }
  }

  async function handleSaveLink() {
    if (!generatedUrl || !selectedOrgId) return

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/utm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'link',
          org_id: selectedOrgId,
          campaign_id: selectedCampaignId || null,
          landing_page_id: selectedLpId || null,
          full_url: generatedUrl,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_term: utmTerm,
          utm_content: utmContent,
          channel_label: channelLabel || null,
          notes: notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess('Link saved!')
      fetchUtmData(selectedOrgId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save link')
    } finally {
      setSaving(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getFieldError(field: string): string | undefined {
    return validationErrors.find(e => e.field === field)?.message
  }

  // ============================================================
  // TEMPLATE MANAGEMENT
  // ============================================================

  function handleSaveTemplate() {
    if (!newTemplateName || !utmSource || !utmMedium) {
      setError('Fill in source and medium, then name the template')
      return
    }
    const template: SavedTemplate = {
      name: newTemplateName,
      source: utmSource,
      medium: utmMedium,
      termPattern: utmTerm,
      contentPattern: utmContent,
      channelLabel: channelLabel,
    }
    const updated = [...templates, template]
    setTemplates(updated)
    persistTemplates(updated)
    setNewTemplateName('')
    setShowSaveTemplate(false)
    setSuccess(`Template "${template.name}" saved!`)
  }

  function handleApplyTemplate(template: SavedTemplate) {
    setUtmSource(template.source)
    setUtmMedium(template.medium)
    if (template.termPattern) setUtmTerm(template.termPattern)
    if (template.contentPattern) setUtmContent(template.contentPattern)
    if (template.channelLabel) setChannelLabel(template.channelLabel)
    setShowTemplates(false)
    setSuccess(`Template "${template.name}" applied`)
  }

  function handleDeleteTemplate(index: number) {
    const updated = templates.filter((_, i) => i !== index)
    setTemplates(updated)
    persistTemplates(updated)
  }

  // Suggested mediums for current source
  const suggestedMediums = (utmSource && SOURCE_MEDIUM_MAP[utmSource])
    ? APPROVED_MEDIUMS.filter(m => SOURCE_MEDIUM_MAP[utmSource].includes(m.value))
    : [];

  const otherMediums = (utmSource && SOURCE_MEDIUM_MAP[utmSource])
    ? APPROVED_MEDIUMS.filter(m => !SOURCE_MEDIUM_MAP[utmSource].includes(m.value))
    : APPROVED_MEDIUMS;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-brand-charcoal mb-2">
          UTM Link Builder
        </h1>
        <p className="text-brand-gray">
          Generate compliant UTM links for client campaigns. All values are validated against{' '}
          <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">UTM-CONVENTIONS.md</span>
        </p>

        {/* Mode Switcher + Templates */}
        <div className="flex items-center gap-3 mt-4">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode('single')}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${mode === 'single' ? 'bg-white text-brand-charcoal shadow-sm font-medium' : 'text-brand-gray hover:text-brand-charcoal'}`}
            >
              <Link2 size={14} className="inline mr-1.5" />
              Single Link
            </button>
            <button
              onClick={() => setMode('batch')}
              className={`text-sm px-3 py-1.5 rounded-md transition-colors ${mode === 'batch' ? 'bg-white text-brand-charcoal shadow-sm font-medium' : 'text-brand-gray hover:text-brand-charcoal'}`}
            >
              <Layers size={14} className="inline mr-1.5" />
              All Channels
            </button>
          </div>
          {mode === 'single' && (
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="text-sm text-brand-mint hover:text-brand-mint-dark flex items-center gap-1"
            >
              <Bookmark size={14} />
              Templates {templates.length > 0 && `(${templates.length})`}
            </button>
          )}
        </div>

        {/* Templates dropdown */}
        <TemplatesDropdown
          templates={templates}
          visible={showTemplates}
          onApplyTemplate={handleApplyTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm p-4 rounded-lg mb-6 flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => { setError(null); setValidationErrors([]) }} className="ml-auto text-red-400 hover:text-red-600" aria-label="Dismiss error">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 text-emerald-700 text-sm p-4 rounded-lg mb-6 flex items-start gap-2">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600" aria-label="Dismiss success message">&times;</button>
        </div>
      )}

      {/* Step 1: Select Organization */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-brand-mint/10 flex items-center justify-center text-sm font-bold text-brand-mint">1</div>
          <h2 className="font-heading text-lg font-semibold text-brand-charcoal">Select Organization</h2>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4">
            <Loader2 size={16} className="animate-spin text-brand-mint" />
            <span className="text-sm text-brand-gray">Loading organizations...</span>
          </div>
        ) : (
          <select
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(e.target.value)}
            className="input w-full max-w-md"
          >
            <option value="">Select an organization...</option>
            {organizations.filter(o => o.is_active).map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        )}
      </div>

      {selectedOrgId && loadingUtm && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-brand-mint" size={24} />
        </div>
      )}

      {selectedOrgId && !loadingUtm && (
        <>
          {/* Step 2: Website URL */}
          <LandingPageSelector
            landingPages={landingPages}
            selectedLpId={selectedLpId}
            customUrl={customUrl}
            onSelectLp={setSelectedLpId}
            onCustomUrlChange={setCustomUrl}
            onLandingPageAdded={() => {
              setSuccess('Landing page added!')
              fetchUtmData(selectedOrgId)
            }}
            orgId={selectedOrgId}
            validationErrors={validationErrors}
          />

          {/* Step 3: Campaign */}
          <CampaignSelector
            campaigns={campaigns}
            selectedCampaignId={selectedCampaignId}
            utmCampaign={utmCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onCampaignChange={(slug) => {
              setUtmCampaign(slug)
              setSelectedCampaignId('')
            }}
            onCampaignAdded={() => {
              setSuccess('Campaign created!')
              fetchUtmData(selectedOrgId)
            }}
            orgId={selectedOrgId}
            validationErrors={validationErrors}
          />

          {/* ============================================================ */}
          {/* BATCH MODE */}
          {/* ============================================================ */}
          {mode === 'batch' && (
            <BatchGenerator
              landingPages={landingPages}
              selectedLpId={selectedLpId}
              customUrl={customUrl}
              utmCampaign={utmCampaign}
              orgId={selectedOrgId}
              selectedCampaignId={selectedCampaignId}
              onSaved={() => {
                setSuccess(`Links saved!`)
                fetchUtmData(selectedOrgId)
              }}
            />
          )}

          {/* ============================================================ */}
          {/* SINGLE LINK MODE */}
          {/* ============================================================ */}
          {mode === 'single' && (
            <>
          {/* Step 4: UTM Parameters */}
          <div className="card mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-brand-mint/10 flex items-center justify-center text-sm font-bold text-brand-mint">4</div>
              <h2 className="font-heading text-lg font-semibold text-brand-charcoal">Tracking Parameters</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-brand-charcoal mb-1">
                  Traffic Source <span className="text-[11px] text-brand-gray font-normal ml-1">Where is the traffic coming from?</span>
                </label>
                <select
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  className={`input w-full ${getFieldError('utm_source') ? 'border-red-300' : ''}`}
                >
                  <option value="">Select source...</option>
                  {APPROVED_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                {getFieldError('utm_source') && (
                  <p className="text-xs text-red-600 mt-1">{getFieldError('utm_source')}</p>
                )}
              </div>

              {/* Medium */}
              <div>
                <label className="block text-sm font-medium text-brand-charcoal mb-1">
                  Channel Type <span className="text-[11px] text-brand-gray font-normal ml-1">How is the traffic being delivered?</span>
                  {suggestedMediums.length > 0 && (
                    <span className="text-[11px] text-brand-mint ml-1 font-normal">
                      (suggested for {utmSource})
                    </span>
                  )}
                </label>
                <select
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  className={`input w-full ${getFieldError('utm_medium') ? 'border-red-300' : ''}`}
                >
                  <option value="">Select medium...</option>
                  {suggestedMediums.length > 0 && (
                    <optgroup label="Suggested">
                      {suggestedMediums.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={suggestedMediums.length > 0 ? 'Other' : 'All Mediums'}>
                    {otherMediums.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                </select>
                {getFieldError('utm_medium') && (
                  <p className="text-xs text-red-600 mt-1">{getFieldError('utm_medium')}</p>
                )}
              </div>

              {/* Term */}
              <div>
                <label className="block text-sm font-medium text-brand-charcoal mb-1">
                  Target Keyword or Audience <span className="text-[11px] text-brand-gray font-normal ml-1">Who or what are you targeting?</span>
                </label>
                <input
                  type="text"
                  value={utmTerm}
                  onChange={(e) => setUtmTerm(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  placeholder="keyword-or-audience-segment"
                  className={`input w-full text-sm font-mono ${getFieldError('utm_term') ? 'border-red-300' : ''}`}
                />
                {getFieldError('utm_term') && (
                  <p className="text-xs text-red-600 mt-1">{getFieldError('utm_term')}</p>
                )}
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-brand-charcoal mb-1">
                  Ad Creative or Placement <span className="text-[11px] text-brand-gray font-normal ml-1">Which version of the ad or link is this?</span>
                </label>
                <input
                  type="text"
                  value={utmContent}
                  onChange={(e) => setUtmContent(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                  placeholder="creative-variation-or-placement"
                  className={`input w-full text-sm font-mono ${getFieldError('utm_content') ? 'border-red-300' : ''}`}
                />
                {getFieldError('utm_content') && (
                  <p className="text-xs text-red-600 mt-1">{getFieldError('utm_content')}</p>
                )}
              </div>
            </div>

            {/* Optional metadata */}
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Channel Label (optional)</label>
                <input
                  type="text"
                  value={channelLabel}
                  onChange={(e) => setChannelLabel(e.target.value)}
                  placeholder="e.g. Google Search, Meta - Instagram Stories"
                  className="input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-brand-gray mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any context about this specific link"
                  className="input w-full text-sm"
                />
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            className="btn-primary w-full py-3 text-base font-medium flex items-center justify-center gap-2 mb-6"
          >
            <Link2 size={18} />
            Generate UTM Link
          </button>

          {/* Generated URL */}
          {generatedUrl && (
            <div className="card mb-6 border-brand-mint/30">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={18} className="text-brand-mint" />
                <h3 className="font-heading font-semibold text-brand-charcoal">Generated Link</h3>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <code className="text-sm text-brand-charcoal break-all leading-relaxed">
                  {generatedUrl}
                </code>
              </div>

              {/* Parameter breakdown */}
              <div className="grid grid-cols-5 gap-2 mb-4 text-xs">
                {[
                  ['source', utmSource],
                  ['medium', utmMedium],
                  ['campaign', utmCampaign],
                  ['term', utmTerm],
                  ['content', utmContent],
                ].map(([label, value]) => (
                  <div key={label} className="bg-gray-50 rounded p-2">
                    <span className="text-brand-gray block mb-0.5">{label}</span>
                    <span className="font-mono text-brand-charcoal font-medium">{value}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(generatedUrl)}
                  className="btn-primary text-sm px-4 py-2 flex items-center gap-2"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy URL'}
                </button>
                <button
                  onClick={handleSaveLink}
                  disabled={saving}
                  className="btn-secondary text-sm px-4 py-2 flex items-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Save to Organization
                </button>
                <a
                  href={generatedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost text-sm px-4 py-2 flex items-center gap-2"
                >
                  <ExternalLink size={14} />
                  Test Link
                </a>
                <button
                  onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                  className="btn-ghost text-sm px-4 py-2 flex items-center gap-2"
                >
                  <Bookmark size={14} />
                  Save as Template
                </button>
              </div>

              {/* Save Template Form */}
              {showSaveTemplate && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-brand-gray mb-1">Template Name</label>
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="e.g. Google Search - Standard"
                      className="input w-full text-sm"
                    />
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!newTemplateName}
                    className="btn-primary text-sm px-4 py-2"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          )}
            </>
          )}

          {/* Saved Links */}
          <SavedLinksSection
            savedLinks={savedLinks}
            orgId={selectedOrgId}
            onLinksChanged={() => fetchUtmData(selectedOrgId)}
          />
        </>
      )}
    </div>
  )
}
