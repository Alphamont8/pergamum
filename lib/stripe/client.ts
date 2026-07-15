import Stripe from 'stripe'
import { CITES_PACKS, type CitesPack } from '@/lib/cites/packs'
export {
  planFromPriceId,
  priceIdForPro,
  PRO_MONTHLY_CITES,
  PRO_PRICING,
} from '@/lib/billing/plans'

export { CITES_PACKS, type CitesPack }

let stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-06-24.dahlia',
      typescript: true,
    })
  }
  return stripe
}

export function priceIdForPack(pack: CitesPack): string | undefined {
  return process.env[CITES_PACKS[pack].priceEnv]
}

export function packFromPriceId(priceId: string): CitesPack | null {
  for (const [pack, meta] of Object.entries(CITES_PACKS) as Array<
    [CitesPack, (typeof CITES_PACKS)[CitesPack]]
  >) {
    if (process.env[meta.priceEnv] === priceId) return pack
  }
  return null
}
