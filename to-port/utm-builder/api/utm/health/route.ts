import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase-server'
import { requireAdminAuth, isAuthError } from '@/lib/api-auth'

/**
 * POST /api/admin/utm/health — check if saved UTM link URLs are reachable
 * Body: { org_id: string }
 * Returns status for each saved link (200 = OK, else flagged)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const result = await requireAdminAuth()
    if (isAuthError(result)) return result

    const body = await request.json()
    const { org_id } = body
    if (!org_id) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 })
    }

    // Fetch all saved links for this org
    const serviceClient = createServiceRoleClient()
    const { data: links, error } = await serviceClient
      .from('client_utm_links')
      .select('id, full_url, channel_label')
      .eq('organization_id', org_id)

    if (error) throw error
    if (!links || links.length === 0) {
      return NextResponse.json({ results: [], message: 'No saved links to check' })
    }

    // Check each URL with a HEAD request (timeout 5s per link)
    const results = await Promise.all(
      links.map(async (link) => {
        try {
          // Extract base URL (without UTM params) for the health check
          const urlObj = new URL(link.full_url)
          const baseUrl = urlObj.origin + urlObj.pathname

          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 5000)

          const res = await fetch(baseUrl, {
            method: 'HEAD',
            redirect: 'follow',
            signal: controller.signal,
          })

          clearTimeout(timeout)

          return {
            id: link.id,
            url: link.full_url,
            channel_label: link.channel_label,
            status: res.status,
            ok: res.ok,
          }
        } catch (err) {
          return {
            id: link.id,
            url: link.full_url,
            channel_label: link.channel_label,
            status: 0,
            ok: false,
            error: err instanceof Error ? err.message : 'Request failed',
          }
        }
      })
    )

    const healthy = results.filter(r => r.ok).length
    const unhealthy = results.filter(r => !r.ok).length

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        healthy,
        unhealthy,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500 }
    )
  }
}
