import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { requireAdminAuth, isAuthError } from '@/lib/api-auth'

/**
 * GET /api/admin/utm?org_id=xxx — fetch UTM data for an organization
 * Returns landing pages, campaigns, and saved links
 */
export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminAuth()
    if (isAuthError(result)) return result

    const orgId = request.nextUrl.searchParams.get('org_id')
    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    const [landingPages, campaigns, links] = await Promise.all([
      supabase
        .from('client_utm_landing_pages')
        .select('*')
        .eq('organization_id', orgId)
        .order('is_primary', { ascending: false })
        .order('label'),
      supabase
        .from('client_utm_campaigns')
        .select('*')
        .eq('organization_id', orgId)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('client_utm_links')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    if (landingPages.error) throw landingPages.error
    if (campaigns.error) throw campaigns.error
    if (links.error) throw links.error

    return NextResponse.json({
      landing_pages: landingPages.data,
      campaigns: campaigns.data,
      links: links.data,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch UTM data' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/utm — create a landing page, campaign, or link
 * Body: { type: 'landing_page' | 'campaign' | 'link', org_id, ...data }
 */
export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminAuth()
    if (isAuthError(result)) return result
    const { auth } = result

    const body = await request.json()
    const { type, org_id, ...data } = body

    if (!type || !org_id) {
      return NextResponse.json({ error: 'type and org_id are required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()

    if (type === 'landing_page') {
      const { data: lp, error } = await supabase
        .from('client_utm_landing_pages')
        .insert({
          organization_id: org_id,
          url: data.url,
          label: data.label,
          is_primary: data.is_primary || false,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ landing_page: lp })
    }

    if (type === 'campaign') {
      const { data: campaign, error } = await supabase
        .from('client_utm_campaigns')
        .insert({
          organization_id: org_id,
          campaign_slug: data.campaign_slug,
          description: data.description || null,
          is_active: true,
          start_date: data.start_date || null,
          end_date: data.end_date || null,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ campaign })
    }

    if (type === 'link') {
      const { data: link, error } = await supabase
        .from('client_utm_links')
        .insert({
          organization_id: org_id,
          campaign_id: data.campaign_id || null,
          landing_page_id: data.landing_page_id || null,
          full_url: data.full_url,
          utm_source: data.utm_source,
          utm_medium: data.utm_medium,
          utm_campaign: data.utm_campaign,
          utm_term: data.utm_term,
          utm_content: data.utm_content,
          channel_label: data.channel_label || null,
          notes: data.notes || null,
          created_by: auth.userId,
        })
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ link })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create UTM record' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/utm?type=xxx&id=xxx — delete a landing page, campaign, or link
 */
export async function DELETE(request: NextRequest) {
  try {
    const result = await requireAdminAuth()
    if (isAuthError(result)) return result

    const type = request.nextUrl.searchParams.get('type')
    const id = request.nextUrl.searchParams.get('id')

    if (!type || !id) {
      return NextResponse.json({ error: 'type and id are required' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const table = type === 'landing_page'
      ? 'client_utm_landing_pages'
      : type === 'campaign'
        ? 'client_utm_campaigns'
        : 'client_utm_links'

    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete' },
      { status: 500 }
    )
  }
}
