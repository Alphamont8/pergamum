/**
 * One-time Cites packs (Basic top-ups).
 *
 * Priced above Pro on a per-Cite basis so subscription stays the better deal for
 * regular writers. See docs/PRICING.md for the full rationale.
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
    priceEnv: string
  }
> = {
  '100': {
    cites: 100,
    amountCents: 299,
    label: '100 Cites',
    blurb: '4-6 essays',
    priceEnv: 'STRIPE_PRICE_CITES_100',
  },
  '200': {
    cites: 200,
    amountCents: 499,
    label: '200 Cites',
    blurb: '8-12 essays',
    priceEnv: 'STRIPE_PRICE_CITES_200',
  },
  '400': {
    cites: 400,
    amountCents: 799,
    label: '400 Cites',
    blurb: '16-20 essays',
    priceEnv: 'STRIPE_PRICE_CITES_400',
  },
  '1000': {
    cites: 1000,
    amountCents: 1699,
    label: '1,000 Cites',
    blurb: '40+ essays',
    priceEnv: 'STRIPE_PRICE_CITES_1000',
  },
}

/** Implied cents per Cite for display (e.g. $0.02/Cite). */
export function packCentsPerCite(pack: CitesPack): number {
  const meta = CITES_PACKS[pack]
  return Math.round((meta.amountCents / meta.cites) * 100) / 100
}
