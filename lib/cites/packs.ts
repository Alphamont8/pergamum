/**
 * One-time Cites packs (Basic top-ups).
 *
 * Pack keys stay stable for Lemon Squeezy custom data / purchases.pack history.
 * Cite amounts are half the key names so prices stay fee-friendly while
 * subscription remains the better deal for regular writers. See docs/PRICING.md.
 */
export type CitesPack = '100' | '200' | '400' | '1000'

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
    cites: 50,
    amountCents: 299,
    label: '50 Cites',
    blurb: '2-3 essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_100',
  },
  '200': {
    cites: 100,
    amountCents: 499,
    label: '100 Cites',
    blurb: '4-6 essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_200',
  },
  '400': {
    cites: 200,
    amountCents: 799,
    label: '200 Cites',
    blurb: '8-10 essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_400',
  },
  '1000': {
    cites: 500,
    amountCents: 1699,
    label: '500 Cites',
    blurb: '20+ essays',
    variantEnv: 'LEMONSQUEEZY_VARIANT_CITES_1000',
  },
}

/** Implied cents per Cite for display (e.g. $0.02/Cite). */
export function packCentsPerCite(pack: CitesPack): number {
  const meta = CITES_PACKS[pack]
  return Math.round((meta.amountCents / meta.cites) * 100) / 100
}
