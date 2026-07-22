/**
 * One-time Cites packs (Basic top-ups).
 *
 * Pack keys match Cite amounts. See docs/PRICING.md.
 */
export type CitesPack = '100' | '200' | '500'

export const CITES_PACKS: Record<
  CitesPack,
  {
    cites: number
    amountCents: number
    label: string
    /** Short UX hint — typical essay uses ~15–25 Cites. */
    blurb: string
    /** Env var holding the Lemon Squeezy variant ID. */
    variantEnv: string
  }
> = {
  '100': {
    cites: 100,
    amountCents: 499,
    label: '100 Cites',
    blurb: '4-6 essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_100',
  },
  '200': {
    cites: 200,
    amountCents: 799,
    label: '200 Cites',
    blurb: '8-10 essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_200',
  },
  '500': {
    cites: 500,
    amountCents: 1699,
    label: '500 Cites',
    blurb: '20+ essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_500',
  },
}

/** Lead pack for upgrade / low-balance upsells. */
export const LEAD_CITES_PACK: CitesPack = '100'

/** Implied cents per Cite for display (e.g. $0.02/Cite). */
export function packCentsPerCite(pack: CitesPack): number {
  const meta = CITES_PACKS[pack]
  return Math.round((meta.amountCents / meta.cites) * 100) / 100
}
