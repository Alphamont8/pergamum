import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  clampRecencyForPlan,
  clampStyleForPlan,
  getUserCitationEntitlements,
} from '@/lib/billing/entitlements'
import type { ReferencingStyleId, SourceRecency } from '@/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const body = (await request.json()) as {
    username?: string | null
    schoolId?: string | null
    defaultStyle?: string
    defaultInText?: boolean
    defaultSuggestCorrections?: boolean
    defaultRecency?: string
    defaultSourceTier?: string
    themePreference?: 'system' | 'light' | 'dark'
    profileOnly?: boolean
    prefsOnly?: boolean
  }

  const updates: Record<string, unknown> = {}
  const entitlements = await getUserCitationEntitlements(user.id)

  if (body.prefsOnly) {
    if (body.defaultStyle !== undefined) {
      updates.default_style = clampStyleForPlan(
        body.defaultStyle as ReferencingStyleId,
        entitlements,
      )
    }
    if (body.defaultInText !== undefined) updates.default_in_text = body.defaultInText
    if (body.defaultSuggestCorrections !== undefined) {
      updates.default_suggest_corrections =
        entitlements.allowSuggestions && body.defaultSuggestCorrections
    }
    if (body.defaultRecency !== undefined) {
      updates.default_recency = clampRecencyForPlan(
        body.defaultRecency as SourceRecency,
        entitlements,
      )
    }
    if (body.defaultSourceTier !== undefined) updates.default_source_tier = body.defaultSourceTier
    if (body.themePreference !== undefined) updates.theme_preference = body.themePreference
  } else {
    const username = (body.username ?? '').trim().toLowerCase()
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return NextResponse.json({ error: "That username isn't valid." }, { status: 400 })
    }

    const service = await createServiceClient()
    const { data: taken } = await service
      .from('profiles')
      .select('id')
      .eq('username', username)
      .neq('id', user.id)
      .maybeSingle()
    if (taken) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })

    updates.username = username
    if (body.schoolId !== undefined) updates.school_id = body.schoolId
    if (!body.profileOnly) {
      if (body.defaultStyle !== undefined) {
        updates.default_style = clampStyleForPlan(
          body.defaultStyle as ReferencingStyleId,
          entitlements,
        )
      }
      if (body.defaultInText !== undefined) updates.default_in_text = body.defaultInText
      if (body.defaultSuggestCorrections !== undefined) {
        updates.default_suggest_corrections =
          entitlements.allowSuggestions && body.defaultSuggestCorrections
      }
      if (body.defaultRecency !== undefined) {
        updates.default_recency = clampRecencyForPlan(
          body.defaultRecency as SourceRecency,
          entitlements,
        )
      }
      if (body.defaultSourceTier !== undefined) updates.default_source_tier = body.defaultSourceTier
      if (body.themePreference !== undefined) updates.theme_preference = body.themePreference
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'There was nothing to update.' }, { status: 400 })
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
