import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applySecretPlanCode, resolveSecretPlanCode } from '@/lib/billing/secretPlanCodes'

/**
 * Redeem a friend/referral code while already signed in.
 * Adds friendship only — no Cites. Referral Cites are awarded solely at signup/onboarding.
 * Secret plan codes (env) can switch the redeemer between Pro and Basic.
 * PGMUP1 always grants full monthly Pro (subscription + allotment).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const body = (await request.json()) as { code?: string }
  const code = (body.code ?? '').trim().toUpperCase()
  if (!code) {
    return NextResponse.json({ error: "That code isn't valid." }, { status: 400 })
  }

  const secretAction = resolveSecretPlanCode(code)
  if (secretAction) {
    try {
      const planTier = await applySecretPlanCode(user.id, secretAction)
      return NextResponse.json({
        message:
          secretAction === 'pro_monthly'
            ? 'Welcome to Pro! Your monthly allotment is active.'
            : planTier === 'pro'
              ? 'Welcome to Pro!'
              : "You're back on Basic.",
        planTier,
      })
    } catch {
      return NextResponse.json(
        { error: "We couldn't update your plan. Try again in a moment." },
        { status: 500 },
      )
    }
  }

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ error: "That code isn't valid." }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data: other } = await service
    .from('profiles')
    .select('id, referral_code')
    .eq('referral_code', code)
    .maybeSingle()

  if (!other) return NextResponse.json({ error: "We couldn't find that code." }, { status: 404 })
  if (other.id === user.id) {
    return NextResponse.json({ error: "You can't use your own code." }, { status: 400 })
  }

  const [a, b] = other.id < user.id ? [other.id, user.id] : [user.id, other.id]
  const { data: existing } = await service
    .from('friendships')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ message: 'You two are already friends.' })
  }

  await service.from('friendships').insert({
    user_a: a,
    user_b: b,
    source: 'friend_code',
  })

  return NextResponse.json({
    message: 'Friend added! Just a heads up, Cites are only awarded when a new account signs up with a code.',
  })
}
