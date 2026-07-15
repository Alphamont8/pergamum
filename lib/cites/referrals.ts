import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

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

/**
 * Genuineness gates only — no lifetime or daily cap on how many real people
 * one referrer can bring in.
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
  if (input.ipHash) {
    const since = new Date(Date.now() - REFERRAL_IP_DEDUP_HOURS * 60 * 60 * 1000).toISOString()
    const { data: ipHit } = await service
      .from('referrals')
      .select('id')
      .eq('referrer_id', input.referrerId)
      .eq('ip_hash', input.ipHash)
      .eq('cites_awarded', true)
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()
    if (ipHit) return { ok: false, reason: 'ip_reuse' }
  }

  return { ok: true }
}
