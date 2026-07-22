import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { creditCites, getReferralReward } from '@/lib/cites/ledger'

/**
 * Same referrer + same hashed IP cannot earn another referral bonus within this window.
 * Scoped to referrer so campus Wi‑Fi friends of different people are not blocked.
 */
export const REFERRAL_IP_DEDUP_HOURS = 48

/** Common throwaway providers — expand as needed. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'sharklasers.com',
  'grr.la',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'yopmail.com',
  'trashmail.com',
  'discard.email',
  'getnada.com',
  'moakt.com',
  'fakeinbox.com',
  'emailondeck.com',
  'maildrop.cc',
])

export function hashClientIp(ip: string | null | undefined): string | null {
  const trimmed = ip?.trim()
  if (!trimmed || trimmed === 'unknown') return null
  const salt = process.env.REFERRAL_IP_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'pergamum'
  return createHash('sha256').update(`${salt}:${trimmed}`).digest('hex')
}

/** Prefer Cloudflare / proxy headers, then first X-Forwarded-For hop. */
export function clientIpFromRequest(request: Request): string | null {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf?.trim()) return cf.trim()
  const real = request.headers.get('x-real-ip')
  if (real?.trim()) return real.trim()
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return null
}

export function isDisposableEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.trim().toLowerCase().split('@')[1]
  if (!domain) return false
  return DISPOSABLE_EMAIL_DOMAINS.has(domain)
}

export type ReferralFraudReason =
  | 'self'
  | 'already_referred'
  | 'email_unverified'
  | 'disposable_email'
  | 'ip_reuse'

export type PendingReferralResult =
  | { status: 'pending' }
  | { status: 'awarded'; reward: number }
  | { status: 'skipped'; reason: ReferralFraudReason }
  | { status: 'not_found' }

/**
 * Genuineness gates only — no lifetime or daily cap on how many real people
 * one referrer can bring in. Each referee may only ever have one referral row
 * (first friend code), awarded after their first Cite spend.
 */
export async function evaluateReferralEligibility(input: {
  referrerId: string
  refereeId: string
  refereeEmail: string | null | undefined
  refereeEmailConfirmed: boolean
  ipHash: string | null
}): Promise<{ ok: true } | { ok: false; reason: ReferralFraudReason }> {
  if (input.referrerId === input.refereeId) {
    return { ok: false, reason: 'self' }
  }
  if (!input.refereeEmailConfirmed) {
    return { ok: false, reason: 'email_unverified' }
  }
  if (isDisposableEmail(input.refereeEmail)) {
    return { ok: false, reason: 'disposable_email' }
  }

  const service = await createServiceClient()

  const { data: already } = await service
    .from('referrals')
    .select('id')
    .eq('referee_id', input.refereeId)
    .maybeSingle()
  if (already) return { ok: false, reason: 'already_referred' }

  // Same person spinning up accounts from one network under one referral code.
  // Count pending + awarded so farms cannot queue multiple pending bonuses.
  if (input.ipHash) {
    const since = new Date(Date.now() - REFERRAL_IP_DEDUP_HOURS * 60 * 60 * 1000).toISOString()
    const { data: ipHit } = await service
      .from('referrals')
      .select('id')
      .eq('referrer_id', input.referrerId)
      .eq('ip_hash', input.ipHash)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()
    if (ipHit) return { ok: false, reason: 'ip_reuse' }
  }

  return { ok: true }
}

async function refereeHasConsumedCites(refereeId: string): Promise<boolean> {
  const service = await createServiceClient()
  const { data } = await service
    .from('cites_ledger')
    .select('id')
    .eq('user_id', refereeId)
    .eq('kind', 'spend')
    .lt('delta', 0)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}

async function ensureFriendship(
  userA: string,
  userB: string,
  source: 'referral' | 'friend_code',
): Promise<void> {
  const service = await createServiceClient()
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA]
  await service.from('friendships').upsert(
    { user_a: a, user_b: b, source },
    { onConflict: 'user_a,user_b' },
  )
}

async function awardReferralCites(input: {
  referralId: string
  referrerId: string
  refereeId: string
}): Promise<number> {
  const reward = await getReferralReward()
  await creditCites({
    userId: input.referrerId,
    delta: reward,
    kind: 'referral',
    referenceId: `referral:${input.referralId}:referrer`,
    note: 'Referral bonus',
  })
  await creditCites({
    userId: input.refereeId,
    delta: reward,
    kind: 'referral',
    referenceId: `referral:${input.referralId}:referee`,
    note: 'Referral welcome bonus',
  })
  return reward
}

/**
 * Link the referee's first friend/referral code as a pending reward.
 * Awards immediately if they have already spent Cites on a generation.
 * Additional codes for the same referee never create another referral row.
 */
export async function linkFirstReferralCode(input: {
  referrerId: string
  refereeId: string
  code: string
  refereeEmail: string | null | undefined
  refereeEmailConfirmed: boolean
  ipHash: string | null
  friendshipSource?: 'referral' | 'friend_code'
}): Promise<PendingReferralResult> {
  const code = input.code.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) return { status: 'not_found' }

  const eligibility = await evaluateReferralEligibility({
    referrerId: input.referrerId,
    refereeId: input.refereeId,
    refereeEmail: input.refereeEmail,
    refereeEmailConfirmed: input.refereeEmailConfirmed,
    ipHash: input.ipHash,
  })

  const source = input.friendshipSource ?? 'referral'

  if (!eligibility.ok) {
    if (eligibility.reason !== 'self' && eligibility.reason !== 'already_referred') {
      await ensureFriendship(input.referrerId, input.refereeId, source)
    }
    return { status: 'skipped', reason: eligibility.reason }
  }

  const service = await createServiceClient()
  const { data: inserted, error } = await service
    .from('referrals')
    .insert({
      referrer_id: input.referrerId,
      referee_id: input.refereeId,
      code,
      cites_awarded: false,
      ip_hash: input.ipHash,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Unique referee_id — another request already claimed the first-code slot.
    if (error.code === '23505') {
      await ensureFriendship(input.referrerId, input.refereeId, source)
      return { status: 'skipped', reason: 'already_referred' }
    }
    throw new Error(error.message)
  }

  if (!inserted?.id) {
    await ensureFriendship(input.referrerId, input.refereeId, source)
    return { status: 'skipped', reason: 'already_referred' }
  }

  await ensureFriendship(input.referrerId, input.refereeId, source)

  if (await refereeHasConsumedCites(input.refereeId)) {
    const awarded = await fulfillPendingReferralForReferee(input.refereeId)
    if (awarded) return { status: 'awarded', reward: awarded.reward }
  }

  return { status: 'pending' }
}

/**
 * After the referee spends Cites on a citation run, grant both sides.
 * Idempotent: only the first successful claim of cites_awarded=false pays out.
 */
export async function fulfillPendingReferralForReferee(
  refereeId: string,
): Promise<{ reward: number; referrerId: string } | null> {
  const service = await createServiceClient()
  const { data: pending } = await service
    .from('referrals')
    .update({ cites_awarded: true })
    .eq('referee_id', refereeId)
    .eq('cites_awarded', false)
    .select('id, referrer_id')
    .maybeSingle()

  if (!pending?.id) return null

  try {
    const reward = await awardReferralCites({
      referralId: pending.id,
      referrerId: pending.referrer_id,
      refereeId,
    })
    return { reward, referrerId: pending.referrer_id }
  } catch (err) {
    // Roll the flag back so a later spend can retry the payout.
    await service
      .from('referrals')
      .update({ cites_awarded: false })
      .eq('id', pending.id)
      .eq('cites_awarded', true)
    throw err
  }
}
