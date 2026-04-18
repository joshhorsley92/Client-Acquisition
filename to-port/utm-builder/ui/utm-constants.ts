// ============================================================
// APPROVED VALUES — must match docs/UTM-CONVENTIONS.md
// ============================================================

export const APPROVED_SOURCES = [
  { value: 'google', label: 'Google' },
  { value: 'meta', label: 'Meta (Facebook / Instagram)' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'email', label: 'Email' },
  { value: 'direct-mail', label: 'Direct Mail (Physical)' },
  { value: 'qr-code', label: 'QR Code' },
  { value: 'landing-page', label: 'Landing Page (Cross-link)' },
  { value: 'newsletter', label: 'Newsletter' },
]

export const APPROVED_MEDIUMS = [
  { value: 'cpc', label: 'CPC (Paid Search)' },
  { value: 'cpm', label: 'CPM (Display / Video)' },
  { value: 'social', label: 'Social (Organic)' },
  { value: 'paid-social', label: 'Paid Social' },
  { value: 'email', label: 'Email' },
  { value: 'referral', label: 'Referral' },
  { value: 'print', label: 'Print (Physical)' },
  { value: 'qr', label: 'QR Code' },
  { value: 'landing-page', label: 'Landing Page' },
  { value: 'video', label: 'Video' },
]

// Smart medium suggestions based on source
export const SOURCE_MEDIUM_MAP: Record<string, string[]> = {
  google: ['cpc', 'cpm', 'video'],
  meta: ['paid-social', 'social'],
  linkedin: ['paid-social', 'social'],
  email: ['email'],
  'direct-mail': ['print'],
  'qr-code': ['qr'],
  'landing-page': ['landing-page'],
  newsletter: ['email'],
}

// Batch generation presets — one per advertising channel
export const BATCH_CHANNELS = [
  { source: 'google', medium: 'cpc', label: 'Google Search', termHint: 'target-keyword' },
  { source: 'meta', medium: 'paid-social', label: 'Meta Ads', termHint: 'audience-segment' },
  { source: 'linkedin', medium: 'paid-social', label: 'LinkedIn Ads', termHint: 'audience-segment' },
  { source: 'email', medium: 'email', label: 'Email Campaign', termHint: 'subscriber-segment' },
  { source: 'qr-code', medium: 'qr', label: 'QR Code', termHint: 'physical-location' },
  { source: 'newsletter', medium: 'email', label: 'Newsletter', termHint: 'subscriber-segment' },
]

export const TEMPLATES_STORAGE_KEY = 'tkbs-utm-templates'

export function loadTemplates(): SavedTemplate[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveTemplates(templates: SavedTemplate[]) {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates))
}

export interface BatchRow {
  source: string
  medium: string
  label: string
  term: string
  termHint?: string
  content: string
  enabled: boolean
}

export interface SavedTemplate {
  name: string
  source: string
  medium: string
  termPattern: string
  contentPattern: string
  channelLabel: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export interface LandingPage {
  id: string
  organization_id: string
  url: string
  label: string
  is_primary: boolean
}

export interface Campaign {
  id: string
  organization_id: string
  campaign_slug: string
  description: string | null
  is_active: boolean
  start_date: string | null
  end_date: string | null
}

export interface SavedLink {
  id: string
  full_url: string
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_term: string
  utm_content: string
  channel_label: string | null
  notes: string | null
  created_at: string
}

export interface ValidationError {
  field: string
  message: string
}
