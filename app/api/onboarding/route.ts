import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { grantManualMonthlyProSubscription, isFullMonthlyProCode } from '@/lib/billing/manualProSubscription'
import { creditCites, getReferralReward } from '@/lib/cites/ledger'
import {
  clientIpFromRequest,
  evaluateReferralEligibility,
  hashClientIp,
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

  // Referral Cites only at signup/onboarding — never on friend-code redeem later.
  // Unlimited real referrals; genuineness gates block fake/self accounts.
  const code = body.referralCode?.trim().toUpperCase()
  let referralAwarded = false
  let referralSkipped: string | null = null
  let proGranted = false

  if (code && isFullMonthlyProCode(code)) {
    await grantManualMonthlyProSubscription(user.id)
    proGranted = true
  } else if (code && /^[A-Z0-9]{6}$/.test(code)) {
    const { data: referrer } = await service
      .from('profiles')
      .select('id, referral_code')
      .eq('referral_code', code)
      .maybeSingle()

    if (referrer && referrer.id !== user.id) {
      const ipHash = hashClientIp(clientIpFromRequest(request))
      const eligibility = await evaluateReferralEligibility({
        referrerId: referrer.id,
        refereeId: user.id,
        refereeEmail: user.email,
        refereeEmailConfirmed: Boolean(user.email_confirmed_at),
        ipHash,
      })

      if (!eligibility.ok) {
        referralSkipped = eligibility.reason
        // Still allow friendship without Cites for soft genuineness blocks.
        if (eligibility.reason !== 'self' && eligibility.reason !== 'already_referred') {
          const [a, b] =
            referrer.id < user.id ? [referrer.id, user.id] : [user.id, referrer.id]
          await service.from('friendships').upsert(
            { user_a: a, user_b: b, source: 'referral' },
            { onConflict: 'user_a,user_b' },
          )
        }
      } else {
        const reward = await getReferralReward()
        await service.from('referrals').insert({
          referrer_id: referrer.id,
          referee_id: user.id,
          code,
          cites_awarded: true,
          ip_hash: ipHash,
        })
        await creditCites({
          userId: referrer.id,
          delta: reward,
          kind: 'referral',
          referenceId: user.id,
          note: 'Referral bonus',
        })
        await creditCites({
          userId: user.id,
          delta: reward,
          kind: 'referral',
          referenceId: referrer.id,
          note: 'Referral welcome bonus',
        })
        const [a, b] =
          referrer.id < user.id ? [referrer.id, user.id] : [user.id, referrer.id]
        await service.from('friendships').upsert(
          { user_a: a, user_b: b, source: 'referral' },
          { onConflict: 'user_a,user_b' },
        )
        referralAwarded = true
      }
    }
  }

  return NextResponse.json({
    ok: true,
    referralAwarded,
    proGranted,
    ...(referralSkipped ? { referralSkipped } : {}),
  })
}
