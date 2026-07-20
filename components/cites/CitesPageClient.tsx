'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { useLibrary } from '@/components/shell/LibraryContext'
import { createClient } from '@/lib/supabase/client'
import { generationIdFromLedgerReference } from '@/lib/cites/ledgerReference'
import { PRO_MONTHLY_CITES, proHeadlineMonthlyPrice } from '@/lib/billing/plans'
import {
  PRO_FEATURES_TRIAL_DAYS,
  type ProTrialSnapshot,
} from '@/lib/billing/proTrial.shared'
import { CITES_PACKS, type CitesPack } from '@/lib/cites/packs'
import type { BillingInterval, PlanTier, SubscriptionStatus } from '@/types'
import { formatAppDate, formatAppDateTime } from '@/lib/format/date'
import './cites.css'

interface LedgerRow {
  id: string
  delta: number
  kind: string
  note: string | null
  reference_id: string | null
  created_at: string
}

interface PurchaseRow {
  id: string
  pack: string
  cites: number
  amount_cents: number
  status: string
  created_at: string
  completed_at: string | null
}

interface SubscriptionSnapshot {
  status: SubscriptionStatus
  billingInterval: BillingInterval
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  nextCitesGrantAt: string | null
}

type HistoryFilter = 'all' | 'spend' | 'purchase' | 'referral' | 'allotment'

function addCalendarMonthFromDate(date: Date): Date {
  const target = new Date(date)
  const day = target.getUTCDate()
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + 1)
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target
}

function subscriptionExpiryFromReference(referenceId: string | null): Date | null {
  if (!referenceId) return null
  const match = /^pro:[^:]+:(\d+)$/.exec(referenceId)
  if (!match) return null
  const periodStart = new Date(Number(match[1]) * 1000)
  if (Number.isNaN(periodStart.getTime())) return null
  return addCalendarMonthFromDate(periodStart)
}

function ledgerExpiry(
  row: LedgerRow,
  nextGrantAt: string | null,
  latestSubscriptionGrantId: string | null,
): string {
  if (row.kind === 'spend' || row.delta < 0) return '—'
  if (row.kind === 'subscription' && row.delta > 0) {
    const fromRef = subscriptionExpiryFromReference(row.reference_id)
    if (fromRef) return formatShortDate(fromRef.toISOString()) ?? 'Resets each cycle'
    if (row.id === latestSubscriptionGrantId && nextGrantAt) {
      return formatShortDate(nextGrantAt) ?? 'Resets each cycle'
    }
    return 'Resets each cycle'
  }
  if (row.kind === 'grant' && /refund/i.test(row.note ?? '')) return '—'
  if (row.kind === 'purchase' || row.kind === 'referral' || row.kind === 'grant' || row.kind === 'ad') {
    return 'Never'
  }
  return '—'
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return null
  return formatAppDate(iso)
}

function daysUntil(iso: string | null | undefined) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

function isGrantBonus(row: LedgerRow): boolean {
  if (row.kind !== 'grant') return false
  const note = row.note?.trim() ?? ''
  return !/refund/i.test(note)
}

function matchesHistoryFilter(row: LedgerRow, filter: HistoryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'allotment') return row.kind === 'subscription'
  if (filter === 'referral') return row.kind === 'referral' || isGrantBonus(row)
  return row.kind === filter
}

function spendLedgerLabel(note: string | null | undefined): string {
  const raw = note?.trim()
  if (!raw) return 'Citation generation.'

  const legacyGen = /^Citation generation \((\d+) sentences?\)$/i.exec(raw)
  if (legacyGen) {
    const count = Number(legacyGen[1])
    return count === 1
      ? 'Generation of 1 citation'
      : `Generation of ${count} citations`
  }

  const legacyRetry = /^Sentence retry \(sentence (\d+)\)$/i.exec(raw)
  if (legacyRetry) {
    return `Retried citation for sentence ${legacyRetry[1]}.`
  }

  return raw
}

function ledgerLabel(row: LedgerRow): string {
  switch (row.kind) {
    case 'subscription':
      return row.note?.trim() || 'Pro monthly refill'
    case 'purchase':
      return row.note?.trim() || 'Cites pack'
    case 'spend':
      return spendLedgerLabel(row.note)
    case 'referral':
      return row.note?.trim() || 'Referral bonus'
    case 'grant': {
      const note = row.note?.trim()
      if (note && /refund/i.test(note)) return note
      return note || 'Credit'
    }
    case 'ad':
      return row.note?.trim() || 'Ad reward'
    default:
      return row.note?.trim() || row.kind
  }
}

function statusLabel(
  subscription: SubscriptionSnapshot | null,
  hasSubscriptionRow: boolean,
): string {
  if (!hasSubscriptionRow) return 'Manual'
  if (!subscription) return 'Manual'
  if (subscription.cancelAtPeriodEnd) return 'Cancellation Scheduled'
  if (subscription.status === 'past_due') return 'Payment Needs Attention'
  if (subscription.status === 'active' || subscription.status === 'trialing') return 'Active'
  return subscription.status.replace(/_/g, ' ')
}

export function CitesPageClient({
  userId,
  permanentBalance,
  proCitesBalance,
  referralCode,
  appUrl,
  planTier,
  trial,
  checkoutResult,
}: {
  userId: string
  permanentBalance: number
  proCitesBalance: number
  referralCode: string
  appUrl: string
  planTier: PlanTier
  trial: ProTrialSnapshot
  checkoutResult: 'success' | 'cancelled' | null
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { generations: libraryGenerations } = useLibrary()
  const [permanentPool, setPermanentPool] = useState(permanentBalance)
  const [proPool, setProPool] = useState(proCitesBalance)
  const [trialState, setTrialState] = useState(trial)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])
  const [subscription, setSubscription] = useState<SubscriptionSnapshot | null>(null)
  const [hasBillingAccount, setHasBillingAccount] = useState(false)
  const [periodSpend, setPeriodSpend] = useState(0)
  const [monthlyAllotment, setMonthlyAllotment] = useState(PRO_MONTHLY_CITES)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all')
  const [refreshKey, setRefreshKey] = useState(0)
  const [friendCode, setFriendCode] = useState('')
  const [message, setMessage] = useState<string | null>(
    checkoutResult === 'success'
      ? trial.phase === 'active'
        ? `Payment received! Your pack Cites are on the way, and Pro features are unlocked for ${PRO_FEATURES_TRIAL_DAYS} days (no monthly Cites allotment, and we won't charge you when the trial ends).`
        : 'Payment received! Your Cites will show up as soon as Stripe finishes confirming it.'
      : checkoutResult === 'cancelled'
        ? 'No worries, checkout was canceled and nothing was charged.'
        : null,
  )
  const [referMessage, setReferMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const referralLink = `${appUrl}/login?ref=${referralCode}`
  const isPro = planTier === 'pro'
  const isFeaturesTrial = trialState.phase === 'active'
  const trialEligible = trialState.phase === 'eligible'
  const proHeadline = proHeadlineMonthlyPrice()
  const hasSubscriptionRow = Boolean(subscription)
  const nextGrantAt = subscription?.nextCitesGrantAt ?? subscription?.currentPeriodEnd ?? null
  const nextGrantDate = formatShortDate(nextGrantAt)
  const daysToRefill = daysUntil(nextGrantAt)
  const periodEndDate = formatShortDate(subscription?.currentPeriodEnd)
  const trialEndDate = formatShortDate(trialState.endsAt)
  const usageCap = monthlyAllotment
  const usagePct = Math.min(100, Math.round((periodSpend / Math.max(usageCap, 1)) * 100))
  const usageTone =
    usagePct >= 90 ? 'is-critical' : usagePct >= 70 ? 'is-warn' : 'is-ok'
  const showAllotment = isPro && !isFeaturesTrial && (hasSubscriptionRow || proPool > 0)

  const hasAllotmentHistory = useMemo(
    () => ledger.some((row) => row.kind === 'subscription'),
    [ledger],
  )

  const latestSubscriptionGrantId = useMemo(() => {
    const latest = ledger.find((row) => row.kind === 'subscription' && row.delta > 0)
    return latest?.id ?? null
  }, [ledger])

  const filteredLedger = useMemo(() => {
    if (historyFilter === 'all') return ledger
    return ledger.filter((row) => matchesHistoryFilter(row, historyFilter))
  }, [historyFilter, ledger])

  const historyFilters = useMemo(() => {
    const filters: Array<{ value: HistoryFilter; label: string }> = [
      { value: 'all', label: 'All' },
      { value: 'spend', label: 'Spent' },
      { value: 'purchase', label: 'Top-ups' },
      { value: 'referral', label: 'Referrals' },
    ]
    if (hasAllotmentHistory || showAllotment) {
      filters.push({ value: 'allotment', label: 'Allotment' })
    }
    return filters
  }, [hasAllotmentHistory, showAllotment])

  const libraryGenerationIds = useMemo(
    () => new Set(libraryGenerations.map((generation) => generation.id.toLowerCase())),
    [libraryGenerations],
  )

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/cites/ledger')
      if (res.status === 401) {
        router.replace('/login?redirect=/cites&error=session')
        return
      }
      if (!res.ok) return
      const data = await res.json()
      setLedger(data.ledger ?? [])
      setPurchases(data.purchases ?? [])
      setSubscription(data.subscription ?? null)
      setHasBillingAccount(Boolean(data.hasBillingAccount))
      setMonthlyAllotment(Number(data.monthlyAllotment) || PRO_MONTHLY_CITES)
      setPeriodSpend(Number(data.periodSpend) || 0)
      if (typeof data.permanentBalance === 'number') setPermanentPool(data.permanentBalance)
      if (typeof data.proCitesBalance === 'number') setProPool(data.proCitesBalance)
      if (data.trial) setTrialState(data.trial)
    })()
  }, [refreshKey, router])

  useEffect(() => {
    setPermanentPool(permanentBalance)
    setProPool(proCitesBalance)
    setTrialState(trial)
  }, [permanentBalance, proCitesBalance, trial])

  useEffect(() => {
    const channel = supabase
      .channel(`cites-balance-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            cites_balance?: number
            pro_cites_balance?: number
          }
          const permanent = Number(row.cites_balance ?? 0)
          const pro = Number(row.pro_cites_balance ?? 0)
          if (Number.isFinite(permanent) && Number.isFinite(pro)) {
            setPermanentPool(permanent)
            setProPool(pro)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, userId])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 8000)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (!referMessage) return
    const timer = window.setTimeout(() => setReferMessage(null), 6000)
    return () => window.clearTimeout(timer)
  }, [referMessage])

  useEffect(() => {
    if (checkoutResult !== 'success') return
    const timer = window.setTimeout(() => router.refresh(), 1500)
    return () => window.clearTimeout(timer)
  }, [checkoutResult, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#refer') return
    document.getElementById('cites-refer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  async function checkout(pack: CitesPack) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout didn\u2019t go through.')
      window.location.href = data.url
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Checkout didn\u2019t go through.')
      setBusy(false)
    }
  }

  async function redeemCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setReferMessage(null)
    try {
      const res = await fetch('/api/friends/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: friendCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'We couldn\u2019t redeem that code.')
      setReferMessage(data.message)
      setFriendCode('')
      if (data.planTier) router.refresh()
      setRefreshKey((key) => key + 1)
    } catch (err) {
      setReferMessage(err instanceof Error ? err.message : 'We couldn\u2019t redeem that code.')
    } finally {
      setBusy(false)
    }
  }

  async function copyReferralLink() {
    await navigator.clipboard.writeText(referralLink)
    setCopiedLink(true)
    window.setTimeout(() => setCopiedLink(false), 1800)
  }

  function renderLedgerRows(rows: LedgerRow[], emptyMessage: string) {
    if (rows.length === 0) {
      return <p className="pg-subtle ledger-table__empty">{emptyMessage}</p>
    }

    return rows.map((row) => {
      const label = ledgerLabel(row)
      const expiry = ledgerExpiry(row, nextGrantAt, latestSubscriptionGrantId)
      const generationId =
        row.kind === 'spend' ? generationIdFromLedgerReference(row.reference_id) : null
      const href =
        generationId && libraryGenerationIds.has(generationId) ? `/c/${generationId}` : null
      const when = formatAppDateTime(row.created_at)
      return (
        <div key={row.id} className="ledger-table__row" role="row">
          <span className="ledger-table__date" role="cell">
            {when}
          </span>
          <span className="ledger-table__desc" role="cell">
            {href ? (
              <Link href={href} className="ledger-row__link">
                {label}
              </Link>
            ) : (
              <span>{label}</span>
            )}
            <span className="ledger-table__expiry-mobile pg-subtle">{expiry}</span>
          </span>
          <span className="ledger-table__expiry pg-subtle" role="cell">
            {expiry}
          </span>
          <span
            className={`ledger-table__delta ${row.delta > 0 ? 'is-credit' : 'is-debit'}`.trim()}
            role="cell"
          >
            {row.delta > 0 ? '+' : ''}
            {row.delta}
          </span>
        </div>
      )
    })
  }

  return (
    <div className="cites-page">
      <BackLink />
      <header className="cites-header">
        <div className="pg-title-copy cites-header__intro">
          <h1>Cites</h1>
          <p className="pg-muted">
            {showAllotment
              ? `Pack top-ups never expire, your Pro allotment refreshes each month, and unused allotment doesn't roll over.`
              : isFeaturesTrial
                ? `Pack Cites never expire, your Pro features trial${trialEndDate ? ` ends ${trialEndDate}` : ''} doesn't include the ${PRO_MONTHLY_CITES} monthly allotment, and you can subscribe when you're ready with no automatic charge.`
                : trialEligible
                  ? `Pack top-ups never expire, and your first top-up unlocks ${PRO_FEATURES_TRIAL_DAYS} days of Pro features without the monthly allotment.`
                  : 'Pack top-ups never expire, and Pro adds a fresh monthly allotment that resets each billing month.'}
          </p>
        </div>

        <div
          className={`cites-header__balances ${showAllotment ? '' : 'is-single'}`.trim()}
        >
          <div className="cites-balance-card">
            <p className="cites-balance-card__label">Pack Cites</p>
            <p className="cites-balance-card__value">{permanentPool.toLocaleString()}</p>
            <p className="cites-balance-card__hint pg-subtle">Never expire</p>
          </div>
          {showAllotment ? (
            <div className="cites-balance-card cites-balance-card--allotment">
              <p className="cites-balance-card__label">Pro Allotment</p>
              <p className="cites-balance-card__value">{proPool.toLocaleString()}</p>
              <p className="cites-balance-card__hint pg-subtle">
                of {usageCap.toLocaleString()} this cycle
              </p>
            </div>
          ) : null}
        </div>

        {trialEligible ? (
          <div className="cites-trial-promo" role="status">
            <p className="cites-trial-promo__eyebrow">Limited Offer</p>
            <p className="cites-trial-promo__headline">
              Your first top-up unlocks {PRO_FEATURES_TRIAL_DAYS} days of Pro features
            </p>
            <p className="cites-trial-promo__body">
              Every Pro tool for free. No card needed. Deeper verification, faster generation, every
              referencing style, and specialty databases.
              <br />
              No {PRO_MONTHLY_CITES} monthly Cites allotment, and we won&apos;t charge you when it
              ends. Your Pack Cites never expire either.
            </p>
          </div>
        ) : null}
      </header>

      {message ? <p className="cites-message">{message}</p> : null}

      {trialState.showConvertPrompt ? (
        <section className="cites-section cites-pro-upgrade" aria-labelledby="cites-trial-ended">
          <div className="pg-title-copy">
            <h2 id="cites-trial-ended">Keep Pro Going</h2>
            <p className="pg-muted">
              Your features trial ended. Subscribe to keep every Pro feature and get{' '}
              {PRO_MONTHLY_CITES} Cites every month. We never auto-convert trials. You only pay
              when you choose a plan.
            </p>
          </div>
          <Link href="/upgrade" className="pg-btn pg-btn--accent pg-btn--md cites-pro-upgrade__cta">
            Subscribe to Pro
          </Link>
        </section>
      ) : null}

      {isPro ? (
        <section className="cites-section cites-pro-wallet" aria-labelledby="cites-pro-wallet-heading">
          <div className="cites-pro-wallet__head">
            <div className="pg-title-copy">
              <h2 id="cites-pro-wallet-heading">
                {isFeaturesTrial ? 'Your Pro Features Trial' : 'Your Pro Plan'}
              </h2>
              <p className="pg-muted">
                {isFeaturesTrial
                  ? trialEndDate
                    ? `Every Pro feature until ${trialEndDate}, pack Cites work with Pro features, and the ${PRO_MONTHLY_CITES} monthly allotment starts after you subscribe.`
                    : `Every Pro feature for ${PRO_FEATURES_TRIAL_DAYS} days, pack Cites work with Pro features, and you can subscribe anytime with nothing charged when the trial ends.`
                  : hasSubscriptionRow
                    ? subscription?.billingInterval === 'year'
                      ? 'Annual billing with a monthly Pro allotment that refreshes each month.'
                      : 'Monthly billing with a Pro allotment that refreshes each cycle.'
                    : 'Pro access is on, but there is no automatic monthly allotment on this account.'}
              </p>
            </div>
            <Link href="/upgrade" className="pg-btn pg-btn--ghost pg-btn--sm cites-pro-wallet__manage">
              {isFeaturesTrial ? 'Keep Pro' : 'Open Plan'}
            </Link>
          </div>

          <dl className="cites-pro-wallet__meta">
            <div>
              <dt>Status</dt>
              <dd>
                {isFeaturesTrial
                  ? trialState.daysRemaining != null && trialState.daysRemaining >= 0
                    ? `Trial · ${trialState.daysRemaining} day${trialState.daysRemaining === 1 ? '' : 's'} left`
                    : 'Trial Active'
                  : statusLabel(subscription, hasSubscriptionRow)}
              </dd>
            </div>
            {isFeaturesTrial ? (
              <div>
                <dt>Trial Ends</dt>
                <dd>{trialEndDate ?? 'Soon'}</dd>
              </div>
            ) : hasSubscriptionRow ? (
              <div>
                <dt>Billing</dt>
                <dd>{subscription?.billingInterval === 'year' ? 'Annual' : 'Monthly'}</dd>
              </div>
            ) : null}
            {!isFeaturesTrial && hasSubscriptionRow ? (
              <div>
                <dt>Next Refill</dt>
                <dd>
                  {subscription?.status === 'past_due'
                    ? 'May pause until billing is updated'
                    : subscription?.cancelAtPeriodEnd && periodEndDate
                      ? `Stops after ${periodEndDate}`
                      : nextGrantDate
                        ? daysToRefill != null && daysToRefill >= 0
                          ? `In ${daysToRefill} day${daysToRefill === 1 ? '' : 's'} · ${nextGrantDate}`
                          : nextGrantDate
                        : 'Scheduled with your subscription'}
                </dd>
              </div>
            ) : null}
          </dl>

          {!isFeaturesTrial && hasSubscriptionRow ? (
            <div className="cites-usage" aria-label="Pro allotment usage">
              <div className="cites-usage__labels">
                <span>Allotment Total</span>
                <span className="pg-subtle">{usagePct}%</span>
              </div>
              <div className={`cites-usage__track ${usageTone}`}>
                <div className="cites-usage__fill" style={{ width: `${usagePct}%` }} />
              </div>
              <p className="pg-muted cites-usage__note">
                Spend draws from your Pro allotment first, then pack Cites, and unused Pro allotment
                resets on the next refill while pack Cites stay.
              </p>
            </div>
          ) : isFeaturesTrial ? (
            <p className="pg-muted cites-usage__note">
              When you subscribe, you&apos;ll get {PRO_MONTHLY_CITES} Cites every month on top of
              your pack Cites. We won&apos;t charge you unless you pick a plan.
            </p>
          ) : (
            <p className="pg-muted cites-usage__note">
              {hasBillingAccount
                ? 'Pack top-ups still work. Your Pro refill schedule will show here once the first grant lands.'
                : 'Pack top-ups still work. Open Manage Plan to connect billing if you want monthly Pro refills.'}
            </p>
          )}
        </section>
      ) : (
        <section className="cites-section cites-pro-upgrade" aria-labelledby="cites-pro-heading">
          <div className="pg-title-copy">
            <h2 id="cites-pro-heading">Top Up or Go Pro</h2>
            {trialEligible ? (
              <p className="pg-muted">
                Packs are one-time and never expire. Your first top-up includes{' '}
                {PRO_FEATURES_TRIAL_DAYS} days of Pro features without the {PRO_MONTHLY_CITES}{' '}
                monthly allotment.
                <br />
                Or subscribe for {PRO_MONTHLY_CITES} Cites every month from ${proHeadline}/mo billed
                annually.
              </p>
            ) : (
              <p className="pg-muted">
                Packs are one-time and never expire. Pro adds {PRO_MONTHLY_CITES} Cites allowance every
                month, plus deeper verification, faster generation, every referencing style, exports,
                and specialty databases.
              </p>
            )}
          </div>
          <div className="cites-pro-compare">
            <div className="cites-pro-compare__option">
              <span className="cites-pro-compare__label">Pack</span>
              <strong>100 Cites · $2.99 once</strong>
              <span className="pg-subtle">
                {trialEligible
                  ? `Includes ${PRO_FEATURES_TRIAL_DAYS}-day Pro features trial`
                  : 'Buy below when you need a boost'}
              </span>
            </div>
            <div className="cites-pro-compare__option is-pro">
              <span className="cites-pro-compare__label">Pro · Best value</span>
              <strong>
                {PRO_MONTHLY_CITES} Cites · ${proHeadline}/mo billed annually
              </strong>
              <span className="pg-subtle">Monthly allotment · every Pro feature</span>
            </div>
          </div>
          <Link href="/upgrade" className="pg-btn pg-btn--accent pg-btn--md cites-pro-upgrade__cta">
            Compare Plans
          </Link>
        </section>
      )}

      <section className="cites-section">
        <div className="pg-title-copy">
          <h2>{isPro && !isFeaturesTrial ? 'Need More Before Refill?' : 'Top Up'}</h2>
          {trialEligible ? (
            <p className="pg-muted">
              First top-up unlocks {PRO_FEATURES_TRIAL_DAYS} days of Pro features. Pack Cites never
              expire and work with Pro while your trial (or subscription) is active.
            </p>
          ) : isPro ? (
            <p className="pg-muted">
              Packs stack forever as pack Cites. They work with Pro features whenever
              Pro is active.
            </p>
          ) : null}
        </div>
        <div className="pack-list">
          {(Object.keys(CITES_PACKS) as CitesPack[]).map((pack) => {
            const meta = CITES_PACKS[pack]
            return (
              <button
                key={pack}
                type="button"
                className="pack-row"
                disabled={busy}
                onClick={() => checkout(pack)}
              >
                <span>
                  <strong>{meta.label}</strong>
                  <span className="pg-subtle">
                    {trialEligible
                      ? `${meta.blurb} · ${PRO_FEATURES_TRIAL_DAYS}-day Pro trial`
                      : meta.blurb}
                  </span>
                </span>
                <span className="pack-price">${(meta.amountCents / 100).toFixed(2)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="cites-section cites-refer-panel" id="cites-refer">
        <div className="pg-title-copy cites-refer-panel__intro">
          <h2>Refer a Friend</h2>
          <p className="pg-muted">
            Pass along your link or code. When someone new signs up with it, you both walk away
            with 50 free Cites. If a friend already has an account, they can still use your code to
            connect, just without the Cites bonus.
          </p>
        </div>
        <div className="cites-refer-panel__grid">
          <div className="cites-refer-panel__col">
            <span className="cites-refer-panel__label">Your Code</span>
            <div className="cites-referral-box">
              <code>{referralCode}</code>
              <Button type="button" variant="primary" size="sm" onClick={() => void copyReferralLink()}>
                {copiedLink ? 'Copied' : 'Copy Link'}
              </Button>
            </div>
          </div>
          <form className="cites-refer-panel__col cites-refer-form" onSubmit={redeemCode}>
            <span className="cites-refer-panel__label">Redeem a Code</span>
            <div className="cites-referral-box cites-refer-input-box">
              <input
                value={friendCode}
                onChange={(e) =>
                  setFriendCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                maxLength={6}
                placeholder="Enter their 6-letter code"
                disabled={busy}
                aria-label="Friend code"
              />
              <Button type="submit" variant="ghost" size="sm" disabled={busy || friendCode.length !== 6}>
                {busy ? 'Redeeming…' : 'Redeem'}
              </Button>
            </div>
          </form>
        </div>
        {referMessage ? <p className="cites-refer-message">{referMessage}</p> : null}
      </section>

      <section className="cites-section">
        <div className="cites-history__head">
          <div className="pg-title-copy">
            <h2>Cites History</h2>
            <p className="pg-muted">
              Top-ups, spends, referrals, and allotment refills in one place.
            </p>
          </div>
          <div className="cites-history__filters" role="tablist" aria-label="Filter Cites history">
            {historyFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={historyFilter === value}
                className={`cites-history__filter ${historyFilter === value ? 'is-active' : ''}`}
                onClick={() => setHistoryFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ledger-table" role="table" aria-label="Cites history">
          <div className="ledger-table__head" role="row">
            <span role="columnheader">Date</span>
            <span role="columnheader">Description</span>
            <span role="columnheader">Expiry</span>
            <span role="columnheader">Cites</span>
          </div>
          {renderLedgerRows(
            filteredLedger,
            historyFilter === 'all' ? 'No activity yet.' : 'No entries for this filter.',
          )}
        </div>

        {historyFilter === 'all' && purchases.length > 0 ? (
          <p className="pg-subtle cites-history__purchases-note">
            Completed pack checkouts also appear above as Top-ups when Stripe finishes confirming
            them.
          </p>
        ) : null}
      </section>
    </div>
  )
}
