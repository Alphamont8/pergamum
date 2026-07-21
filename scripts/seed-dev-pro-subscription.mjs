/**
 * Grant a dev/admin account a full monthly Pro subscription (no Lemon Squeezy required).
 *
 * Usage: node scripts/seed-dev-pro-subscription.mjs [username]
 * Default username: epstein
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnvLocal()

const username = (process.argv[2] ?? 'epstein').trim().toLowerCase()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const PRO_MONTHLY_CITES = 300

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

function monthBounds(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}

function grantReference(subscriptionId, periodStartIso) {
  const unixSeconds = Math.floor(new Date(periodStartIso).getTime() / 1000)
  return `pro:${subscriptionId}:${unixSeconds}`
}

async function main() {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, plan_tier, cites_balance, pro_cites_balance')
    .eq('username', username)
    .maybeSingle()

  if (profileError) throw new Error(profileError.message)
  if (!profile) {
    console.error(`No profile found for username "${username}".`)
    process.exit(1)
  }

  const userId = profile.id
  const billingSubscriptionId = `sub_dev_${username}_monthly`
  const billingCustomerId = `cus_dev_${username}`
  const { start: periodStart, end: periodEnd } = monthBounds()
  const referenceId = grantReference(billingSubscriptionId, periodStart)
  const now = new Date().toISOString()

  const { error: subscriptionError } = await supabase.from('subscriptions').upsert(
    {
      user_id: userId,
      billing_subscription_id: billingSubscriptionId,
      billing_customer_id: billingCustomerId,
      plan_tier: 'pro',
      billing_interval: 'month',
      status: 'active',
      monthly_cites: PRO_MONTHLY_CITES,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      next_cites_grant_at: periodEnd,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  if (subscriptionError) throw new Error(subscriptionError.message)

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      plan_tier: 'pro',
      default_suggest_corrections: true,
      pro_trial_ends_at: null,
      pro_trial_started_at: profile.pro_trial_started_at ?? now,
      billing_customer_id: billingCustomerId,
      updated_at: now,
    })
    .eq('id', userId)
  if (profileUpdateError) throw new Error(profileUpdateError.message)

  const { data: existingGrant } = await supabase
    .from('cites_ledger')
    .select('id')
    .eq('kind', 'subscription')
    .eq('reference_id', referenceId)
    .maybeSingle()

  if (!existingGrant) {
    const { error: grantError } = await supabase.from('cites_ledger').insert({
      user_id: userId,
      delta: PRO_MONTHLY_CITES,
      kind: 'subscription',
      reference_id: referenceId,
      note: 'Pro monthly Cites',
    })
    if (grantError) throw new Error(grantError.message)
  }

  const { data: refreshed, error: refreshError } = await supabase
    .from('profiles')
    .select('username, plan_tier, cites_balance, pro_cites_balance')
    .eq('id', userId)
    .single()
  if (refreshError) throw new Error(refreshError.message)

  const { data: subscription, error: subReadError } = await supabase
    .from('subscriptions')
    .select('billing_interval, status, current_period_end, monthly_cites')
    .eq('user_id', userId)
    .single()
  if (subReadError) throw new Error(subReadError.message)

  console.log(`Configured @${refreshed.username} as monthly Pro:`)
  console.log(`  plan_tier: ${refreshed.plan_tier}`)
  console.log(`  pack Cites: ${refreshed.cites_balance}`)
  console.log(`  Pro allotment: ${refreshed.pro_cites_balance} / ${subscription.monthly_cites}`)
  console.log(`  billing: ${subscription.billing_interval} · ${subscription.status}`)
  console.log(`  period ends: ${subscription.current_period_end}`)
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const name = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[name]) process.env[name] = value
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
