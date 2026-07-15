import type { BillingInterval, PlanTier } from '@/types'

/** Default free tier stored in `profiles.plan_tier`. */
export const FREE_PLAN_TIER = 'basic' as const satisfies PlanTier

/** Normalize DB / legacy values to a valid plan tier. */
export function normalizePlanTier(value: unknown): PlanTier {
  if (value === 'basic' || value === 'plus' || value === 'pro') return value
  if (value === 'base') return 'basic'
  return FREE_PLAN_TIER
}

export function planDisplayName(planTier: PlanTier): string {
  return planTier.charAt(0).toUpperCase() + planTier.slice(1)
}

/** Pro subscribers receive this many Cites each billing month. */
export const PRO_MONTHLY_CITES = 300

/** Soft word cap for Basic-tier drafts (no cap on Pro). */
export const BASIC_MAX_WORDS = 1000

export const PRO_PRICING = {
  month: {
    label: 'Monthly',
    displayMonthlyCents: 599,
    priceEnv: 'STRIPE_PRICE_PRO_MONTHLY',
  },
  year: {
    label: 'Annual',
    /** Effective monthly rate when billed annually ($4.99/mo × 12). */
    displayMonthlyCents: 499,
    /** Total annual charge in cents ($54.89). */
    displayAnnualCents: 5489,
    priceEnv: 'STRIPE_PRICE_PRO_ANNUAL',
  },
} as const satisfies Record<
  BillingInterval,
  {
    label: string
    displayMonthlyCents: number
    priceEnv: string
    displayAnnualCents?: number
  }
>

/** Default checkout interval — annual effective rate is the headline Pro price. */
export const DEFAULT_PRO_BILLING_INTERVAL: BillingInterval = 'year'

/** Display order for billing toggles (annual first). */
export const PRO_BILLING_INTERVAL_ORDER: BillingInterval[] = ['year', 'month']

export function formatProPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Headline Pro price: $4.99/mo when billed annually. */
export function proHeadlineMonthlyPrice(): string {
  return formatProPrice(PRO_PRICING.year.displayMonthlyCents)
}

export function proAnnualBillPrice(): string {
  return formatProPrice(PRO_PRICING.year.displayAnnualCents ?? 5489)
}

export interface PlanComparisonRow {
  label: string
  basic: string
  pro: string
  /** Both plans offer the same capability. */
  shared?: boolean
}

export interface PlanComparisonSection {
  title: string
  rows: PlanComparisonRow[]
}

export const PLAN_COMPARISON_SECTIONS: PlanComparisonSection[] = [
  {
    title: 'CITES & BILLING',
    rows: [
      {
        label: 'Monthly Cites',
        basic: 'No monthly allotment',
        pro: `${PRO_MONTHLY_CITES} per month allotment`,
      },
      {
        label: 'Cites Top-Ups',
        basic: 'One-time packs',
        pro: 'One-time packs',
        shared: true,
      },
      {
        label: 'Ads',
        basic: 'Ads shown',
        pro: 'Ad-free forever',
      },
    ],
  },
  {
    title: 'DRAFTING',
    rows: [
      {
        label: 'Draft Length',
        basic: 'Up to 1,000 words',
        pro: 'Unlimited',
      },
      {
        label: 'In-Text Citations',
        basic: 'Included',
        pro: 'Included',
        shared: true,
      },
      { label: 'Suggestions', basic: 'Not included', pro: 'Included' },
      {
        label: 'Saved Drafts',
        basic: 'Included',
        pro: 'Included',
        shared: true,
      },
    ],
  },
  {
    title: 'REFERENCING',
    rows: [
      {
        label: 'Referencing Styles',
        basic: 'APA, MLA, Harvard',
        pro: 'All 15 styles',
      },
      {
        label: 'Source Recency',
        basic: 'Any year',
        pro: 'Filter by recency',
      },
      {
        label: 'Exports',
        basic: 'Copy text',
        pro: 'Word, PDF, BibTeX, and more',
      },
      {
        label: 'Sentence Retry',
        basic: 'Not included',
        pro: 'Included',
      },
      {
        label: 'Failed Citation Refunds',
        basic: 'Included',
        pro: 'Included',
        shared: true,
      },
      {
        label: 'Verification Depth',
        basic: 'Standard matches',
        pro: 'Deeper checks',
      },
      {
        label: 'Generation Speed',
        basic: 'Standard speed',
        pro: 'Ultra speed',
      },
    ],
  },
  {
    title: 'SEARCH & SOURCES',
    rows: [
      {
        label: 'Academic Database',
        basic: 'Included',
        pro: 'Included',
        shared: true,
      },
      {
        label: 'Medical Database',
        basic: 'Not included',
        pro: 'Included',
      },
      {
        label: 'Legal Database',
        basic: 'Not included',
        pro: 'Included',
      },
      {
        label: 'Real-Time Web Search',
        basic: 'Included',
        pro: 'Included',
        shared: true,
      },
      {
        label: 'Agentic Web Search',
        basic: 'Not included',
        pro: 'Included',
      },
    ],
  },
]

export function priceIdForPro(interval: BillingInterval): string | undefined {
  return process.env[PRO_PRICING[interval].priceEnv]
}

export function planFromPriceId(
  priceId: string,
): { planTier: Exclude<PlanTier, 'basic'>; billingInterval: BillingInterval } | null {
  for (const interval of Object.keys(PRO_PRICING) as BillingInterval[]) {
    if (priceIdForPro(interval) === priceId) {
      return { planTier: 'pro', billingInterval: interval }
    }
  }
  return null
}
