import Stripe from 'stripe'

let stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-08-27.basil',
      typescript: true,
    })
  }
  return stripe
}

export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  Plus: process.env.STRIPE_PRICE_PLUS,
  Pro: process.env.STRIPE_PRICE_PRO,
  Max: process.env.STRIPE_PRICE_MAX,
}

export function tierFromStripePrice(priceId: string): string {
  if (priceId === process.env.STRIPE_PRICE_MAX) return 'Max'
  if (priceId === process.env.STRIPE_PRICE_PRO) return 'Pro'
  if (priceId === process.env.STRIPE_PRICE_PLUS) return 'Plus'
  return 'Basic'
}
