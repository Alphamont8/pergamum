import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import { getProTrialSnapshot } from '@/lib/billing/proTrial'
import type { BillingInterval, SubscriptionStatus } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const [
    { data: ledger, error: ledgerError },
    { data: purchases, error: purchasesError },
    { data: subscription, error: subscriptionError },
    { data: profile },
    { data: lastProGrantRow },
  ] = await Promise.all([
    supabase
      .from('cites_ledger')
      .select('id, delta, kind, note, reference_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('purchases')
      .select('id, pack, cites, amount_cents, status, created_at, completed_at')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('subscriptions')
      .select(
        'status, billing_interval, current_period_end, cancel_at_period_end, next_cites_grant_at',
      )
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('profiles').select('stripe_customer_id, cites_balance, pro_cites_balance, pro_trial_started_at, pro_trial_ends_at, plan_tier').eq('id', user.id).maybeSingle(),
    supabase
      .from('cites_ledger')
      .select('delta, created_at')
      .eq('user_id', user.id)
      .eq('kind', 'subscription')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 })
  if (purchasesError) return NextResponse.json({ error: purchasesError.message }, { status: 500 })
  if (subscriptionError) {
    return NextResponse.json({ error: subscriptionError.message }, { status: 500 })
  }

  const rows = ledger ?? []
  const periodStart = lastProGrantRow?.created_at ?? null
  const permanentBalance = Number(profile?.cites_balance ?? 0)
  const proCitesBalance = Number(profile?.pro_cites_balance ?? 0)
  const trial = await getProTrialSnapshot(user.id)

  let periodSpend = 0
  if (periodStart) {
    const { data: spendRows } = await supabase
      .from('cites_ledger')
      .select('delta')
      .eq('user_id', user.id)
      .eq('kind', 'spend')
      .gte('created_at', periodStart)
    periodSpend = (spendRows ?? []).reduce(
      (sum, row) => sum + Math.abs(Number(row.delta) || 0),
      0,
    )
  }

  return NextResponse.json({
    ledger: rows,
    purchases: purchases ?? [],
    balance: permanentBalance + proCitesBalance,
    permanentBalance,
    proCitesBalance,
    monthlyAllotment: PRO_MONTHLY_CITES,
    periodSpend,
    lastProGrant: lastProGrantRow
      ? {
          delta: Number(lastProGrantRow.delta) || 0,
          createdAt: lastProGrantRow.created_at,
        }
      : null,
    hasBillingAccount: Boolean(profile?.stripe_customer_id),
    trial,
    subscription: subscription
      ? {
          status: subscription.status as SubscriptionStatus,
          billingInterval: subscription.billing_interval as BillingInterval,
          currentPeriodEnd: subscription.current_period_end as string | null,
          cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
          nextCitesGrantAt: subscription.next_cites_grant_at as string | null,
        }
      : null,
  })
}
