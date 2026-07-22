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
export const PRO_MONTHLY_CITES = 200

/** Soft word cap for Basic-tier drafts (no cap on Pro). */
export const BASIC_MAX_WORDS = 1000

/** Semester Pro duration (4 months). */
export const SEMESTER_PRO_DAYS = 120

/** Semester Pro one-time price in cents ($19.99). */
export const SEMESTER_PRO_AMOUNT_CENTS = 1999

export const PRO_PRICING = {
  month: {
    label: 'Monthly',
    displayMonthlyCents: 699,
    variantEnv: 'LEMONSQUEEZY_VARIANT_PRO_MONTHLY',
  },
  semester: {
    label: 'Semester',
    /** Effective monthly rate when billed as a semester pass ($19.99 / 4). */
    displayMonthlyCents: 500,
    /** Total semester charge in cents ($19.99). */
    displayTotalCents: SEMESTER_PRO_AMOUNT_CENTS,
    days: SEMESTER_PRO_DAYS,
    variantEnv: 'LEMONSQUEEZY_VARIANT_PRO_SEMESTER',
  },
} as const satisfies Record<
  BillingInterval,
  {
    label: string
    displayMonthlyCents: number
    variantEnv: string
    displayTotalCents?: number
    days?: number
  }
>

/** Default checkout interval — Semester is the headline Pro offer. */
export const DEFAULT_PRO_BILLING_INTERVAL: BillingInterval = 'semester'

/** Display order for billing toggles (semester first). */
export const PRO_BILLING_INTERVAL_ORDER: BillingInterval[] = ['semester', 'month']

export function formatProPrice(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** Headline Pro price: $6.99/mo monthly. */
export function proHeadlineMonthlyPrice(): string {
  return formatProPrice(PRO_PRICING.month.displayMonthlyCents)
}

export function proSemesterBillPrice(): string {
  return formatProPrice(PRO_PRICING.semester.displayTotalCents ?? SEMESTER_PRO_AMOUNT_CENTS)
}

/** Effective monthly rate for Semester ($5.00/mo). */
export function proSemesterEffectiveMonthlyPrice(): string {
  return formatProPrice(PRO_PRICING.semester.displayMonthlyCents)
}

/** Four months of Monthly Pro at list price (for savings callouts). */
export function fourMonthsMonthlyTotalCents(): number {
  return PRO_PRICING.month.displayMonthlyCents * 4
}

/** Rounded percent saved vs paying Monthly for four months. */
export function semesterSavingsPercent(): number {
  const full = fourMonthsMonthlyTotalCents()
  if (full <= 0) return 0
  return Math.round(((full - SEMESTER_PRO_AMOUNT_CENTS) / full) * 100)
}

export function semesterSavingsLabel(): string {
  return `Save ${semesterSavingsPercent()}%`
}

export interface PlanComparisonRow {
  label: string
  basic: string
  pro: string
  /** Short promo line under the Basic cell (comparison table only). */
  basicNote?: string
  /** Short promo line under the Pro cell (comparison table only). */
  proNote?: string
  /** Pill tag on the Basic column. */
  basicTag?: string
  /** Pill tag on the Pro column. */
  proTag?: string
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
        label: 'Pro Features',
        basic: 'Basic features only',
        basicTag: '7-Day Pro Trial on First Pack',
        pro: 'Every Pro feature',
      },
      {
        label: 'Allotment',
        basic: 'None',
        pro: `${PRO_MONTHLY_CITES} per month`,
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

export function variantIdForPro(interval: BillingInterval): string | undefined {
  return process.env[PRO_PRICING[interval].variantEnv]?.trim() || undefined
}

export function planFromVariantId(
  variantId: string,
): { planTier: Exclude<PlanTier, 'basic'>; billingInterval: BillingInterval } | null {
  for (const interval of Object.keys(PRO_PRICING) as BillingInterval[]) {
    if (variantIdForPro(interval) === String(variantId)) {
      return { planTier: 'pro', billingInterval: interval }
    }
  }
  return null
}

export function isSemesterBillingInterval(interval: unknown): interval is 'semester' {
  return interval === 'semester'
}
