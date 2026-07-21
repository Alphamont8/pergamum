'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { formatAppDate } from '@/lib/format/date'
import {
  DEFAULT_PRO_BILLING_INTERVAL,
  planDisplayName,
  PLAN_COMPARISON_SECTIONS,
  PRO_BILLING_INTERVAL_ORDER,
  PRO_MONTHLY_CITES,
  PRO_PRICING,
  formatProPrice,
  proAnnualBillPrice,
  proHeadlineMonthlyPrice,
} from '@/lib/billing/plans'
import {
  PRO_FEATURES_TRIAL_DAYS,
  type ProTrialSnapshot,
} from '@/lib/billing/proTrial.shared'
import type {
  BillingInterval,
  PlanTier,
  SubscriptionStatus,
} from '@/types'
import './upgrade.css'

interface SubscriptionSnapshot {
  status: SubscriptionStatus
  billingInterval: BillingInterval
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  nextCitesGrantAt: string | null
}

interface UpgradeInitialState {
  planTier: PlanTier
  citesBalance: number
  permanentCitesBalance: number
  proCitesBalance: number
  hasBillingAccount: boolean
  trial: ProTrialSnapshot
  subscription: SubscriptionSnapshot | null
  checkoutResult: 'success' | 'cancelled' | null
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

function proRefillSentence(nextGrantDate: string, daysToRefill: number | null) {
  if (daysToRefill != null && daysToRefill >= 0) {
    return `Your Pro allotment refills in ${daysToRefill} day${daysToRefill === 1 ? '' : 's'} on ${nextGrantDate}.`
  }
  return `Your Pro allotment refills on ${nextGrantDate}.`
}

function upgradeWalletCopy(
  initial: UpgradeInitialState,
  {
    isPro,
    isFeaturesTrial,
    trialEligible,
    nextGrantDate,
    daysToRefill,
    headlinePrice,
  }: {
    isPro: boolean
    isFeaturesTrial: boolean
    trialEligible: boolean
    nextGrantDate: string | null
    daysToRefill: number | null
    headlinePrice: string
  },
): { title: string; description: string } {
  const pack = initial.permanentCitesBalance
  const allotment = initial.proCitesBalance
  const total = initial.citesBalance
  const hasSubscription = Boolean(initial.subscription)
  const showBreakdown = isPro && !isFeaturesTrial && (hasSubscription || allotment > 0)

  if (showBreakdown && hasSubscription && nextGrantDate) {
    return {
      title: 'Your Cites',
      description: `You have ${pack.toLocaleString()} Pack Cites and ${allotment.toLocaleString()} Pro allotment left this cycle. ${proRefillSentence(nextGrantDate, daysToRefill)} Pack Cites never expire.`,
    }
  }

  if (showBreakdown) {
    return {
      title: 'Your Cites',
      description: `You have ${pack.toLocaleString()} Pack Cites and ${allotment.toLocaleString()} Pro allotment available. Pack Cites never expire.`,
    }
  }

  if (isFeaturesTrial) {
    return {
      title: 'Your Cites',
      description: `You have ${pack.toLocaleString()} Pack Cites. They never expire and work with Pro features during your trial. This trial does not include the ${PRO_MONTHLY_CITES} monthly allotment.`,
    }
  }

  if (isPro) {
    return {
      title: 'Your Cites',
      description: `You have ${total.toLocaleString()} Cites available. Pro adds ${PRO_MONTHLY_CITES} Cites every month, and pack top-ups never expire.`,
    }
  }

  if (trialEligible) {
    return {
      title: 'Your Cites',
      description: `You have ${total.toLocaleString()} Cites. Buy a pack anytime, or subscribe for ${PRO_MONTHLY_CITES} Cites every month from $${headlinePrice}/mo billed annually. Your first top-up unlocks ${PRO_FEATURES_TRIAL_DAYS} days of Pro features.`,
    }
  }

  return {
    title: 'Your Cites',
    description: `You have ${total.toLocaleString()} Cites. Buy a pack anytime, or subscribe for ${PRO_MONTHLY_CITES} every month from $${headlinePrice}/mo billed annually.`,
  }
}

export function UpgradePageClient({ initial }: { initial: UpgradeInitialState }) {
  const router = useRouter()
  const [interval, setInterval] = useState<BillingInterval>(
    initial.subscription?.billingInterval ?? DEFAULT_PRO_BILLING_INTERVAL,
  )
  const [busy, setBusy] = useState<'subscribe' | 'portal' | null>(null)
  const [message, setMessage] = useState<string | null>(
    initial.checkoutResult === 'success'
      ? 'Payment received! Pro will switch on as soon as we finish confirming it.'
      : initial.checkoutResult === 'cancelled'
        ? 'No worries, checkout was canceled and nothing was charged.'
        : null,
  )

  const isPro = initial.planTier === 'pro'
  const isFeaturesTrial = initial.trial.phase === 'active'
  const trialEligible = initial.trial.phase === 'eligible'
  const showTrialConvert = initial.trial.showConvertPrompt
  const pricing = PRO_PRICING[interval]
  const headlinePrice = proHeadlineMonthlyPrice()
  const annualBillPrice = proAnnualBillPrice()
  const monthlyBillPrice = formatProPrice(PRO_PRICING.month.displayMonthlyCents)
  const periodEnd = initial.subscription?.currentPeriodEnd
    ? formatAppDate(initial.subscription.currentPeriodEnd)
    : null
  const trialEnd = formatShortDate(initial.trial.endsAt)
  const trialDays = initial.trial.daysRemaining
  const nextGrantAt =
    initial.subscription?.nextCitesGrantAt ?? initial.subscription?.currentPeriodEnd ?? null
  const nextGrantDate = formatShortDate(nextGrantAt)
  const daysToRefill = daysUntil(nextGrantAt)
  const planTierLabel = isFeaturesTrial ? 'Pro Trial' : planDisplayName(initial.planTier)
  const planStatus = (() => {
    if (isFeaturesTrial) return { label: 'Features Trial', tone: 'accent' as const }
    if (showTrialConvert) return { label: 'Trial Ended', tone: 'warn' as const }
    if (isPro) {
      if (initial.subscription?.cancelAtPeriodEnd) {
        return { label: 'Cancellation Scheduled', tone: 'warn' as const }
      }
      if (initial.subscription?.status === 'past_due') {
        return { label: 'Payment Needs Attention', tone: 'danger' as const }
      }
      return { label: 'Pro Active', tone: 'accent' as const }
    }
    return { label: 'No Subscription', tone: 'muted' as const }
  })()
  const walletCopy = upgradeWalletCopy(initial, {
    isPro,
    isFeaturesTrial,
    trialEligible,
    nextGrantDate,
    daysToRefill,
    headlinePrice,
  })

  useEffect(() => {
    if (initial.checkoutResult !== 'success') return
    const timer = window.setTimeout(() => router.refresh(), 1500)
    return () => window.clearTimeout(timer)
  }, [initial.checkoutResult, router])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 8000)
    return () => window.clearTimeout(timer)
  }, [message])

  async function subscribe() {
    setBusy('subscribe')
    setMessage(null)
    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "We couldn't start checkout.")
      }
      window.location.assign(data.url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't start checkout.")
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy('portal')
    setMessage(null)
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "We couldn't open billing management.")
      }
      window.location.assign(data.url)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't open billing management.")
      setBusy(null)
    }
  }

  return (
    <div className="upgrade-page">
      <BackLink />

      <header className={`upgrade-header ${isPro ? 'is-pro' : ''}`.trim()}>
        <div className="upgrade-header__intro">
          <div className="pg-title-copy">
            <h1>{isPro ? 'Plan' : 'Upgrade'}</h1>
            <p className="pg-muted">
              {isFeaturesTrial
                ? `You're on a Pro features trial${trialEnd ? ` until ${trialEnd}` : ''}. Pack Cites still work, and the ${PRO_MONTHLY_CITES} monthly allotment starts when you subscribe. We won't charge you when the trial ends.`
                : showTrialConvert
                  ? `Your Pro features trial ended. Subscribe to keep every Pro feature and get ${PRO_MONTHLY_CITES} Cites every month. Nothing is charged unless you choose a plan.`
                  : isPro
                    ? 'Manage your Pro subscription here. Your Cites, refill schedule, and pack top-ups live on the Cites page.'
                    : `Pick the plan that matches how you write.`}
            </p>
          </div>
        </div>
        <div
          className={`upgrade-current ${isPro || isFeaturesTrial ? 'is-pro' : ''}`.trim()}
          aria-label="Current plan"
        >
          <span className="upgrade-current__label">Current Plan</span>
          <p
            className={`upgrade-current__value ${isPro || isFeaturesTrial ? 'is-pro' : ''}`.trim()}
          >
            {planTierLabel}
          </p>
          <span className={`upgrade-current__badge is-${planStatus.tone}`.trim()}>
            {planStatus.label}
          </span>
        </div>
      </header>

      {message ? (
        <div className="upgrade-message" role="status">
          <p>{message}</p>
          {initial.checkoutResult === 'success' ? (
            <Link href="/cites" className="upgrade-message__link">
              See your Cites and next refill
            </Link>
          ) : null}
        </div>
      ) : null}

      {(isFeaturesTrial || showTrialConvert) && (
        <section className="upgrade-status" aria-label="Pro features trial">
          <div className="pg-title-copy">
            <strong>
              {isFeaturesTrial
                ? trialDays != null && trialDays >= 0
                  ? `Pro features trial · ${trialDays} day${trialDays === 1 ? '' : 's'} left`
                  : 'Pro features trial is active'
                : 'Your Pro features trial ended'}
            </strong>
            <p className="pg-muted">
              {isFeaturesTrial
                ? `Enjoy every Pro feature with your pack Cites. Subscribe when you're ready for the ${PRO_MONTHLY_CITES} monthly allotment. We never auto-convert trials.`
                : `Subscribe to keep Pro features and unlock ${PRO_MONTHLY_CITES} Cites every month. Pack Cites you already bought still never expire.`}
            </p>
          </div>
          {!isFeaturesTrial ? (
            <Button variant="accent" disabled={busy !== null} onClick={subscribe}>
              {busy === 'subscribe' ? 'Opening Checkout…' : 'Subscribe to Pro'}
            </Button>
          ) : (
            <Button variant="accent" disabled={busy !== null} onClick={subscribe}>
              {busy === 'subscribe' ? 'Opening Checkout…' : 'Keep Pro · Subscribe'}
            </Button>
          )}
        </section>
      )}

      <section className="upgrade-wallet" aria-label="Your Cites">
        <div className="pg-title-copy">
          <strong>{walletCopy.title}</strong>
          <p className="pg-muted">{walletCopy.description}</p>
        </div>
        <Link href="/cites" className="pg-btn pg-btn--ghost pg-btn--sm upgrade-wallet__cta">
          Manage Cites
        </Link>
      </section>

      {isPro && initial.subscription ? (
        <section className="upgrade-status" aria-label="Subscription status">
          <div className="pg-title-copy">
            <strong>
              {initial.subscription.cancelAtPeriodEnd
                ? 'Pro cancellation scheduled.'
                : initial.subscription.status === 'past_due'
                  ? 'Payment needs attention.'
                  : 'Pro is active.'}
            </strong>
            <p className="pg-muted">
              {initial.subscription.cancelAtPeriodEnd && periodEnd
                ? `You'll keep every Pro feature until ${periodEnd}, no rush.`
                : periodEnd
                  ? `Your ${initial.subscription.billingInterval === 'year' ? 'annual' : 'monthly'} subscription renews on ${periodEnd}.`
                  : 'Update your payment details or cancel whenever you like through the billing portal.'}
            </p>
          </div>
          <Button
            variant="ghost"
            disabled={busy !== null || !initial.hasBillingAccount}
            onClick={openPortal}
          >
            {busy === 'portal' ? 'Opening…' : 'Manage or Cancel Pro'}
          </Button>
        </section>
      ) : null}

      <div className="upgrade-billing-toggle" role="tablist" aria-label="Billing interval">
        {PRO_BILLING_INTERVAL_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={interval === value}
            className={interval === value ? 'is-active' : ''}
            onClick={() => setInterval(value)}
          >
            {PRO_PRICING[value].label}
          </button>
        ))}
      </div>

      <section className="upgrade-plan-grid" aria-label="Plan options">
        <article className={`upgrade-plan-card ${!isPro ? 'is-current' : ''}`}>
          <div className="upgrade-plan-card__top">
            <div>
              <p className="upgrade-plan-card__name">Basic</p>
              <h2>Everything you need to get citing</h2>
            </div>
            {!isPro ? <span className="upgrade-badge">Current</span> : null}
          </div>
          <p className="upgrade-price">
            $0 <span>/ month</span>
          </p>
          <p className="pg-muted">
            No subscription required. Just bring your own Cites, whether purchased, earned, or
            referred.
            {trialEligible
              ? ` Your first Cites top-up includes ${PRO_FEATURES_TRIAL_DAYS} days of Pro features.`
              : ''}
          </p>
          <ul className="upgrade-feature-list">
            <li>APA, MLA, and Harvard styles</li>
            <li>Drafts up to 1,000 words</li>
            <li>Academic database and real-time web search</li>
            <li>In-text citations included</li>
            <li>
              {trialEligible
                ? `One-time Cites top-ups with a ${PRO_FEATURES_TRIAL_DAYS}-day Pro trial`
                : 'One-time Cites top-ups'}
            </li>
          </ul>
          {!isPro ? (
            <Link href="/cites" className="pg-btn pg-btn--ghost pg-btn--md upgrade-plan-action">
              {trialEligible ? 'Top Up · Start Trial' : 'Top Up Cites'}
            </Link>
          ) : (
            <Button variant="ghost" disabled className="upgrade-plan-action">
              Available after Pro
            </Button>
          )}
        </article>

        <article className={`upgrade-plan-card is-featured ${isPro && !isFeaturesTrial ? 'is-current' : ''}`}>
          <div className="upgrade-plan-card__top">
            <div>
              <p className="upgrade-plan-card__name is-pro">Pro</p>
              <h2>For writers who cite a lot</h2>
            </div>
            <span className="upgrade-badge">
              {isFeaturesTrial ? 'On Trial' : isPro ? 'Current' : 'Available Now'}
            </span>
          </div>
          <p className="upgrade-price">
            ${formatProPrice(pricing.displayMonthlyCents)} <span>/ month</span>
          </p>
          <p className="pg-muted">
            {interval === 'year' ? (
              <>
                ${annualBillPrice}/year billed annually (${headlinePrice}/mo).
              </>
            ) : (
              <>
                Billed monthly at ${formatProPrice(PRO_PRICING.month.displayMonthlyCents)}/mo, or{' '}
                <button
                  type="button"
                  className="upgrade-price-nudge"
                  onClick={() => setInterval('year')}
                >
                  ${headlinePrice}/mo billed annually
                </button>
                .
              </>
            )}
          </p>
          <ul className="upgrade-feature-list">
            <li>{PRO_MONTHLY_CITES} monthly Cites allotment</li>
            <li>Deeper verification and faster generation</li>
            <li>All 15 referencing styles</li>
            <li>No word cap, fully customizable</li>
            <li>Export to Word, PDF, BibTeX, and RIS</li>
            <li>All databases and agentic web search</li>
          </ul>
          {isPro && !isFeaturesTrial ? (
            <Button
              variant="ghost"
              className="upgrade-plan-action"
              disabled={busy !== null || !initial.hasBillingAccount}
              onClick={openPortal}
            >
              {busy === 'portal' ? 'Opening…' : 'Manage or Cancel Pro'}
            </Button>
          ) : (
            <Button
              variant="accent"
              className="upgrade-plan-action"
              disabled={busy !== null}
              onClick={subscribe}
            >
              {busy === 'subscribe'
                ? 'Opening Checkout…'
                : isFeaturesTrial || showTrialConvert
                  ? interval === 'year'
                    ? `Keep Pro · $${annualBillPrice}/yr`
                    : `Keep Pro · $${monthlyBillPrice}/mo`
                  : interval === 'year'
                    ? `Subscribe Annually · $${annualBillPrice}/yr`
                    : `Subscribe Monthly · $${monthlyBillPrice}/mo`}
            </Button>
          )}
        </article>
      </section>

      <section className="upgrade-comparison" aria-labelledby="upgrade-comparison-heading">
        <div className="pg-title-copy">
          <p className="upgrade-eyebrow">Comparison</p>
          <h2 id="upgrade-comparison-heading">Basic and Pro, Side by Side</h2>
          <p className="pg-muted">
            See how the Basic and Pro plans compare, and find the one most suitable for your needs.
          </p>
        </div>

        <div className="compare-table" role="table" aria-label="Basic and Pro comparison">
          <div className="compare-table__head" role="row">
            <span className="compare-table__head-spacer" aria-hidden="true" />
            <span role="columnheader">Basic</span>
            <span role="columnheader">Pro</span>
          </div>

          <div className="compare-table__body">
            {PLAN_COMPARISON_SECTIONS.map((section) => (
              <section key={section.title} className="compare-group" aria-label={section.title}>
                <h3 className="compare-group__title">{section.title}</h3>
                <div className="compare-group__rows">
                  {section.rows.map((row) => (
                    <div
                      className={`compare-group__row ${row.shared ? 'is-shared' : ''}`.trim()}
                      role="row"
                      key={row.label}
                    >
                      <span className="compare-group__feature" role="cell">
                        {row.label}
                      </span>
                      <span className="compare-group__value" role="cell">
                        {row.basic}
                      </span>
                      <span
                        className={`compare-group__value ${row.shared ? 'is-shared' : 'is-pro'}`.trim()}
                        role="cell"
                      >
                        {row.pro}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
