import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyDemoTesterCode, isDemoTesterCode } from '@/lib/billing/demoTesterCode'
import { grantManualMonthlyProSubscription, isFullMonthlyProCode } from '@/lib/billing/manualProSubscription'
import {
  clientIpFromRequest,
  hashClientIp,
  linkFirstReferralCode,
} from '@/lib/cites/referrals'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const body = (await request.json()) as {
    username?: string
    schoolId?: string | null
    referralCode?: string | null
  }

  const username = (body.username ?? '').trim().toLowerCase()
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return NextResponse.json({ error: "That username isn't valid." }, { status: 400 })
  }

  const service = await createServiceClient()

  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 })
  }

  if (body.schoolId) {
    const { data: school } = await service
      .from('schools')
      .select('id')
      .eq('id', body.schoolId)
      .maybeSingle()
    if (!school) return NextResponse.json({ error: "We couldn't find that school." }, { status: 400 })
  }

  // Profile fields users may set (economy fields protected by DB trigger)
  const { error } = await service
    .from('profiles')
    .update({
      username,
      school_id: body.schoolId ?? null,
      onboarding_complete: true,
    })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // First friend/referral code only — Cites stay pending until the new account spends Cites.
  const code = body.referralCode?.trim().toUpperCase()
  let referralAwarded = false
  let referralPending = false
  let referralSkipped: string | null = null
  let proGranted = false
  let demoTesterApplied = false

  if (code && isDemoTesterCode(code)) {
    const result = await applyDemoTesterCode(user.id)
    if (result === 'applied') demoTesterApplied = true
  } else if (code && isFullMonthlyProCode(code)) {
    await grantManualMonthlyProSubscription(user.id)
    proGranted = true
  } else if (code && /^[A-Z0-9]{6}$/.test(code)) {
    const { data: referrer } = await service
      .from('profiles')
      .select('id, referral_code')
      .eq('referral_code', code)
      .maybeSingle()

    if (referrer) {
      const linked = await linkFirstReferralCode({
        referrerId: referrer.id,
        refereeId: user.id,
        code,
        refereeEmail: user.email,
        refereeEmailConfirmed: Boolean(user.email_confirmed_at),
        ipHash: hashClientIp(clientIpFromRequest(request)),
        friendshipSource: 'referral',
      })
      if (linked.status === 'awarded') referralAwarded = true
      else if (linked.status === 'pending') referralPending = true
      else if (linked.status === 'skipped') referralSkipped = linked.reason
    }
  }

  return NextResponse.json({
    ok: true,
    referralAwarded,
    referralPending,
    proGranted,
    demoTesterApplied,
    ...(referralSkipped ? { referralSkipped } : {}),
  })
}
