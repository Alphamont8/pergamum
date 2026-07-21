/**
 * Lemon Squeezy API helpers — checkouts, portal, cancel.
 */
import {
  cancelSubscription,
  createCheckout,
  getSubscription,
  lemonSqueezySetup,
} from '@lemonsqueezy/lemonsqueezy.js'
import { CITES_PACKS, type CitesPack } from '@/lib/cites/packs'
import {
  planFromVariantId,
  variantIdForPro,
} from '@/lib/billing/plans'
import type { BillingInterval } from '@/types'

let configured = false

export function ensureLemonSetup(): boolean {
  const apiKey = process.env.LEMONSQUEEZY_API_KEY?.trim()
  if (!apiKey) return false
  if (!configured) {
    lemonSqueezySetup({ apiKey })
    configured = true
  }
  return true
}

export function isLemonConfigured(): boolean {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY?.trim() &&
      process.env.LEMONSQUEEZY_STORE_ID?.trim(),
  )
}

export function storeId(): string | undefined {
  return process.env.LEMONSQUEEZY_STORE_ID?.trim()
}

export function variantIdForPack(pack: CitesPack): string | undefined {
  return process.env[CITES_PACKS[pack].variantEnv]?.trim() || undefined
}

export function packFromVariantId(variantId: string): CitesPack | null {
  for (const [pack, meta] of Object.entries(CITES_PACKS) as Array<
    [CitesPack, (typeof CITES_PACKS)[CitesPack]]
  >) {
    if (process.env[meta.variantEnv]?.trim() === String(variantId)) return pack
  }
  return null
}

export { variantIdForPro, planFromVariantId }

export interface CreateLemonCheckoutParams {
  variantId: string
  userId: string
  email?: string | null
  custom: Record<string, string>
  redirectUrl: string
}

export async function createLemonCheckout(
  params: CreateLemonCheckoutParams,
): Promise<{ checkoutId: string; url: string } | null> {
  if (!ensureLemonSetup()) return null
  const store = storeId()
  if (!store) return null

  const { data, error } = await createCheckout(store, params.variantId, {
    checkoutData: {
      email: params.email ?? undefined,
      custom: params.custom,
    },
    productOptions: {
      redirectUrl: params.redirectUrl,
    },
    checkoutOptions: {
      embed: false,
      // Keep discount field so promo codes work like Stripe allow_promotion_codes.
      discount: true,
    },
  })

  if (error || !data?.data) {
    console.warn('[lemonsqueezy] createCheckout failed', error?.message ?? 'no data')
    return null
  }

  const checkoutId = data.data.id
  const url = data.data.attributes.url
  if (!checkoutId || !url) return null
  return { checkoutId, url }
}

export async function getCustomerPortalUrl(
  subscriptionId: string,
): Promise<string | null> {
  if (!ensureLemonSetup()) return null
  const { data, error } = await getSubscription(subscriptionId)
  if (error || !data?.data) {
    console.warn('[lemonsqueezy] getSubscription failed', error?.message ?? 'no data')
    return null
  }
  return data.data.attributes.urls?.customer_portal ?? null
}

export async function cancelLemonSubscription(
  subscriptionId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!ensureLemonSetup()) return { ok: false, error: 'Billing is not configured.' }
  // Manual / seed IDs are not real Lemon subscriptions.
  if (subscriptionId.startsWith('sub_manual_') || subscriptionId.startsWith('sub_dev_')) {
    return { ok: true }
  }
  const { error } = await cancelSubscription(subscriptionId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function fetchLemonSubscription(subscriptionId: string) {
  if (!ensureLemonSetup()) return null
  const { data, error } = await getSubscription(subscriptionId)
  if (error || !data?.data) {
    console.warn('[lemonsqueezy] getSubscription failed', error?.message ?? 'no data')
    return null
  }
  return data.data
}

export type { BillingInterval, CitesPack }
