import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { applyDemoTesterCode, isDemoTesterCode } from '@/lib/billing/demoTesterCode'
import { applySecretPlanCode, resolveSecretPlanCode } from '@/lib/billing/secretPlanCodes'
import { getReferralReward } from '@/lib/cites/ledger'
import {
  clientIpFromRequest,
  hashClientIp,
  linkFirstReferralCode,
} from '@/lib/cites/referrals'

/**
 * Redeem a friend/referral code while already signed in.
 * The first eligible friend code on an account creates a pending referral reward
 * (paid out after that account spends Cites). Later codes only add friendship.
 * TRYPGM grants demo testers +250 Cites and a one-month Pro trial.
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

  if (isDemoTesterCode(code)) {
    try {
      const result = await applyDemoTesterCode(user.id)
      if (result === 'already_used') {
        return NextResponse.json(
          { error: "You've already redeemed the demo tester code." },
          { status: 409 },
        )
      }
      return NextResponse.json({
        message:
          'Demo tester bonus applied! You received 250 Cites and a one-month Pro trial.',
        demoTesterApplied: true,
      })
    } catch {
      return NextResponse.json(
        { error: "We couldn't apply that code. Try again in a moment." },
        { status: 500 },
      )
    }
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

  const linked = await linkFirstReferralCode({
    referrerId: other.id,
    refereeId: user.id,
    code,
    refereeEmail: user.email,
    refereeEmailConfirmed: Boolean(user.email_confirmed_at),
    ipHash: hashClientIp(clientIpFromRequest(request)),
    friendshipSource: 'friend_code',
  })

  if (linked.status === 'awarded') {
    return NextResponse.json({
      message: existing
        ? `You both received ${linked.reward} Cites.`
        : `Friend added! You both received ${linked.reward} Cites.`,
      referralAwarded: true,
      reward: linked.reward,
    })
  }

  if (linked.status === 'pending') {
    const reward = await getReferralReward()
    return NextResponse.json({
      message: existing
        ? `You'll both get ${reward} Cites after you run a citation that uses Cites.`
        : `Friend added! You'll both get ${reward} Cites after you run a citation that uses Cites.`,
      referralPending: true,
      reward,
    })
  }

  if (linked.status === 'skipped' && linked.reason === 'already_referred') {
    if (!existing) {
      await service.from('friendships').insert({
        user_a: a,
        user_b: b,
        source: 'friend_code',
      })
      return NextResponse.json({
        message: 'Friend added! Referral Cites only apply to the first friend code on an account.',
        referralPending: false,
      })
    }
    return NextResponse.json({ message: 'You two are already friends.' })
  }

  if (linked.status === 'skipped') {
    // Soft genuineness skip already upserted friendship inside linkFirstReferralCode.
    if (existing) {
      return NextResponse.json({ message: 'You two are already friends.' })
    }
    return NextResponse.json({
      message: "Friend added! Referral Cites couldn't be reserved for this code right now.",
      referralPending: false,
      referralSkipped: linked.reason,
    })
  }

  if (!existing) {
    await service.from('friendships').insert({
      user_a: a,
      user_b: b,
      source: 'friend_code',
    })
  }
  return NextResponse.json({
    message: existing ? 'You two are already friends.' : 'Friend added!',
  })
}
