import { createServiceClient } from '@/lib/supabase/server'
import { PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import { creditCites, creditCitesOnce } from '@/lib/cites/ledger'

/** Redeemable code for demo testers: +250 Cites and a one-month Pro trial. */
export const DEMO_TESTER_CODE = 'TRYPGM'

export const DEMO_TESTER_CITES_BONUS = 250
export const DEMO_TESTER_PRO_TRIAL_DAYS = 30

const PAID_PRO_STATUSES = new Set(['active', 'trialing', 'past_due'])

function bundleReferenceId(userId: string): string {
  return `demo_tester:${userId}`
}

function proAllotmentReferenceId(userId: string): string {
  return `demo_tester:pro:${userId}`
}

export function isDemoTesterCode(code: string): boolean {
  const normalized = code.trim().toUpperCase()
  if (normalized === DEMO_TESTER_CODE) return true
  const configured = process.env.DEMO_TESTER_CODE?.trim().toUpperCase()
  return Boolean(configured && normalized === configured)
}

async function hasPaidProAccess(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  userId: string,
): Promise<boolean> {
  const { data } = await service
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()
  return Boolean(data && PAID_PRO_STATUSES.has(data.status))
}

async function hasRedeemedDemoTesterBundle(userId: string): Promise<boolean> {
  const service = await createServiceClient()
  const { data } = await service
    .from('cites_ledger')
    .select('id')
    .eq('user_id', userId)
    .eq('reference_id', bundleReferenceId(userId))
    .maybeSingle()
  return Boolean(data)
}

/**
 * Grant +250 permanent Cites and a 30-day Pro trial (features + one monthly allotment).
 * Idempotent per account.
 */
export async function applyDemoTesterCode(
  userId: string,
): Promise<'applied' | 'already_used'> {
  if (await hasRedeemedDemoTesterBundle(userId)) {
    return 'already_used'
  }

  const service = await createServiceClient()
  const started = new Date()
  const ends = new Date(started)
  ends.setUTCDate(ends.getUTCDate() + DEMO_TESTER_PRO_TRIAL_DAYS)
  const now = started.toISOString()

  await creditCites({
    userId,
    delta: DEMO_TESTER_CITES_BONUS,
    kind: 'grant',
    referenceId: bundleReferenceId(userId),
    note: 'Demo tester bonus',
  })

  const paid = await hasPaidProAccess(service, userId)
  if (!paid) {
    const { data: profile } = await service
      .from('profiles')
      .select('pro_trial_started_at')
      .eq('id', userId)
      .maybeSingle()

    const { error: profileError } = await service
      .from('profiles')
      .update({
        plan_tier: 'pro',
        default_suggest_corrections: true,
        pro_trial_started_at: (profile?.pro_trial_started_at as string | null) ?? now,
        pro_trial_ends_at: ends.toISOString(),
        updated_at: now,
      })
      .eq('id', userId)
    if (profileError) throw new Error(profileError.message)

    await creditCitesOnce({
      userId,
      delta: PRO_MONTHLY_CITES,
      kind: 'subscription',
      referenceId: proAllotmentReferenceId(userId),
      note: 'Demo tester Pro trial allotment',
    })
  }

  return 'applied'
}
