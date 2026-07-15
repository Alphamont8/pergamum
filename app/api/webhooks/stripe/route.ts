import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { CITES_PACKS, getStripe, type CitesPack } from '@/lib/stripe/client'
import { creditCitesOnce } from '@/lib/cites/ledger'
import {
  grantPaidPeriodCites,
  syncStripeSubscription,
} from '@/lib/billing/subscriptions'
import { maybeStartProFeaturesTrial } from '@/lib/billing/proTrial'

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const stripe = getStripe()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid signature' },
      { status: 400 },
    )
  }

  const supabase = await createServiceClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'payment' && session.payment_status === 'paid') {
          await completeCitesPurchase(session)
        }
        break
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'payment') {
          await supabase
            .from('purchases')
            .update({ status: 'failed' })
            .eq('stripe_session_id', session.id)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncStripeSubscription(event.data.object as Stripe.Subscription)
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        if (
          invoice.billing_reason !== 'subscription_create' &&
          invoice.billing_reason !== 'subscription_cycle'
        ) {
          break
        }
        // Never grant monthly Cites on $0 invoices (e.g. accidental Stripe trials).
        if ((invoice.amount_paid ?? 0) <= 0) break

        const subscriptionId = invoiceSubscriptionId(invoice)
        if (!subscriptionId) break

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const synced = await syncStripeSubscription(subscription)
        if (synced) await grantPaidPeriodCites(synced)
        break
      }
      default:
        break
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ received: true })
}

async function completeCitesPurchase(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id
  const pack = session.metadata?.pack as CitesPack | undefined
  if (!userId || !pack || !(pack in CITES_PACKS)) return

  const meta = CITES_PACKS[pack]
  const cites = Number(session.metadata?.cites ?? meta.cites)
  if (!Number.isFinite(cites) || cites <= 0) return

  const service = await createServiceClient()
  const { error: purchaseError } = await service.from('purchases').upsert(
    {
      user_id: userId,
      stripe_session_id: session.id,
      stripe_payment_intent:
        typeof session.payment_intent === 'string' ? session.payment_intent : null,
      pack,
      cites,
      amount_cents: meta.amountCents,
      status: 'completed',
      completed_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_session_id' },
  )
  if (purchaseError) throw new Error(purchaseError.message)

  await creditCitesOnce({
    userId,
    delta: cites,
    kind: 'purchase',
    referenceId: session.id,
    note: `Purchased ${cites} Cites`,
  })

  // First qualifying pack purchase unlocks a 14-day Pro features trial (no 300 Cites, no auto-charge).
  await maybeStartProFeaturesTrial(userId)
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  if (invoice.parent?.type !== 'subscription_details') return null
  const subscription = invoice.parent.subscription_details?.subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}
