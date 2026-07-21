import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { CITES_PACKS, type CitesPack } from '@/lib/cites/packs'
import { creditCitesOnce } from '@/lib/cites/ledger'
import {
  grantPaidPeriodCites,
  syncLemonSubscription,
  type LemonSubscriptionAttrs,
} from '@/lib/billing/subscriptions'
import { maybeStartProFeaturesTrial } from '@/lib/billing/proTrial'
import { packFromVariantId, ensureLemonSetup, fetchLemonSubscription } from '@/lib/lemonsqueezy/client'

interface LemonWebhookPayload {
  meta?: {
    event_name?: string
    custom_data?: Record<string, unknown>
  }
  data?: {
    type?: string
    id?: string
    attributes?: Record<string, unknown>
    relationships?: Record<string, { data?: { id?: string; type?: string } | null }>
  }
}

export async function POST(request: Request) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim()
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret is not configured.' }, { status: 400 })
  }

  const rawBody = await request.text()
  const signatureHeader = request.headers.get('X-Signature') ?? ''
  const signature = Buffer.from(signatureHeader, 'hex')
  const hmac = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'), 'hex')

  if (signature.length === 0 || signature.length !== hmac.length || !crypto.timingSafeEqual(hmac, signature)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  let payload: LemonWebhookPayload
  try {
    payload = JSON.parse(rawBody) as LemonWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const eventName = payload.meta?.event_name
  if (!eventName || !payload.data) {
    return NextResponse.json({ error: 'Malformed webhook.' }, { status: 400 })
  }

  try {
    switch (eventName) {
      case 'order_created':
        await handleOrderCreated(payload)
        break
      case 'order_refunded':
        await handleOrderRefunded(payload)
        break
      case 'subscription_created':
      case 'subscription_updated':
      case 'subscription_cancelled':
      case 'subscription_resumed':
      case 'subscription_expired':
      case 'subscription_paused':
      case 'subscription_unpaused':
        await handleSubscriptionEvent(payload)
        break
      case 'subscription_payment_success':
        await handleSubscriptionPaymentSuccess(payload)
        break
      case 'subscription_payment_failed':
      case 'subscription_payment_recovered':
      case 'subscription_payment_refunded':
        // Status changes arrive via subscription_updated; no Cites grant on failed/refunded.
        break
      default:
        break
    }
  } catch (err) {
    console.error('[lemonsqueezy webhook]', eventName, err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ received: true })
}

async function handleOrderCreated(payload: LemonWebhookPayload) {
  const custom = payload.meta?.custom_data ?? {}
  const attrs = payload.data?.attributes ?? {}
  const orderId = payload.data?.id
  if (!orderId) return

  // Subscription first orders also fire order_created — packs only here.
  const pack =
    resolvePack(custom.pack) ??
    packFromVariantId(String(firstOrderVariantId(attrs) ?? ''))
  if (!pack) return

  const userId = String(custom.supabase_user_id ?? '')
  if (!userId) return

  const meta = CITES_PACKS[pack]
  const cites = Number(custom.cites ?? meta.cites)
  if (!Number.isFinite(cites) || cites <= 0) return

  const checkoutKey = `ls_order_${orderId}`
  const service = await createServiceClient()

  // Prefer completing a pending row created at checkout; otherwise upsert by order id.
  const { data: pending } = await service
    .from('purchases')
    .select('id, checkout_id')
    .eq('user_id', userId)
    .eq('pack', pack)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pending?.checkout_id) {
    const { error } = await service
      .from('purchases')
      .update({
        billing_order_id: String(orderId),
        cites,
        amount_cents: meta.amountCents,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', pending.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await service.from('purchases').upsert(
      {
        user_id: userId,
        checkout_id: checkoutKey,
        billing_order_id: String(orderId),
        pack,
        cites,
        amount_cents: meta.amountCents,
        status: 'completed',
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'checkout_id' },
    )
    if (error) throw new Error(error.message)
  }

  await creditCitesOnce({
    userId,
    delta: cites,
    kind: 'purchase',
    referenceId: checkoutKey,
    note: `Purchased ${cites} Cites`,
  })

  await maybeStartProFeaturesTrial(userId)
}

async function handleOrderRefunded(payload: LemonWebhookPayload) {
  const orderId = payload.data?.id
  if (!orderId) return
  const service = await createServiceClient()
  await service
    .from('purchases')
    .update({ status: 'failed' })
    .eq('billing_order_id', String(orderId))
}

async function handleSubscriptionEvent(payload: LemonWebhookPayload) {
  const attrs = lemonSubscriptionFromPayload(payload)
  if (!attrs) return
  await syncLemonSubscription(attrs)
}

async function handleSubscriptionPaymentSuccess(payload: LemonWebhookPayload) {
  const invoiceAttrs = payload.data?.attributes ?? {}
  const billingReason = String(invoiceAttrs.billing_reason ?? '')
  if (billingReason !== 'initial' && billingReason !== 'renewal') return

  const total = Number(invoiceAttrs.total ?? 0)
  // Never grant monthly Cites on $0 invoices (free trials / comps).
  if (!Number.isFinite(total) || total <= 0) return

  const subscriptionId = String(invoiceAttrs.subscription_id ?? '')
  if (!subscriptionId) return

  ensureLemonSetup()
  const sub = await fetchLemonSubscription(subscriptionId)
  if (!sub) {
    console.warn('[lemonsqueezy] payment_success getSubscription failed')
    return
  }

  const custom = payload.meta?.custom_data as LemonSubscriptionAttrs['custom'] | undefined
  const attrs: LemonSubscriptionAttrs = {
    id: sub.id,
    customerId: String(sub.attributes.customer_id),
    variantId: String(sub.attributes.variant_id),
    status: String(sub.attributes.status),
    cancelled: Boolean(sub.attributes.cancelled),
    renewsAt: sub.attributes.renews_at ?? null,
    endsAt: sub.attributes.ends_at ?? null,
    createdAt: sub.attributes.created_at,
    trialEndsAt: sub.attributes.trial_ends_at ?? null,
    custom: custom ?? undefined,
  }

  const periodStart = String(invoiceAttrs.created_at ?? new Date().toISOString())
  const synced = await syncLemonSubscription(attrs, { periodStartOverride: periodStart })
  if (synced) await grantPaidPeriodCites(synced)
}

function lemonSubscriptionFromPayload(
  payload: LemonWebhookPayload,
): LemonSubscriptionAttrs | null {
  const id = payload.data?.id
  const attrs = payload.data?.attributes
  if (!id || !attrs) return null

  const custom = payload.meta?.custom_data as LemonSubscriptionAttrs['custom'] | undefined
  return {
    id: String(id),
    customerId: String(attrs.customer_id ?? ''),
    variantId: String(attrs.variant_id ?? ''),
    status: String(attrs.status ?? ''),
    cancelled: Boolean(attrs.cancelled),
    renewsAt: (attrs.renews_at as string | null) ?? null,
    endsAt: (attrs.ends_at as string | null) ?? null,
    createdAt: String(attrs.created_at ?? new Date().toISOString()),
    trialEndsAt: (attrs.trial_ends_at as string | null) ?? null,
    custom,
  }
}

function resolvePack(raw: unknown): CitesPack | null {
  if (typeof raw !== 'string') return null
  return raw in CITES_PACKS ? (raw as CitesPack) : null
}

function firstOrderVariantId(attrs: Record<string, unknown>): string | number | null {
  const items = attrs.first_order_item as { variant_id?: string | number } | null | undefined
  if (items?.variant_id != null) return items.variant_id
  return null
}
