import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createServiceClient } from '@/lib/supabase/server'
import { getStripe, tierFromStripePrice } from '@/lib/stripe/client'

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

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.created'
  ) {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata?.supabase_user_id
    const priceId = sub.items.data[0]?.price.id
    const tier = priceId ? tierFromStripePrice(priceId) : 'Plus'

    if (userId) {
      await supabase.from('profiles').update({ subscription_tier: tier }).eq('id', userId)
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        stripe_subscription_id: sub.id,
        plan: tier,
        status: sub.status,
        current_period_end: (() => {
          const end = (sub as Stripe.Subscription & { current_period_end?: number })
            .current_period_end
          return end ? new Date(end * 1000).toISOString() : null
        })(),
        updated_at: new Date().toISOString(),
      })
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata?.supabase_user_id
    if (userId) {
      await supabase.from('profiles').update({ subscription_tier: 'Basic' }).eq('id', userId)
      await supabase
        .from('subscriptions')
        .update({ status: 'canceled', plan: 'Basic', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.supabase_user_id
    const plan = session.metadata?.plan ?? 'Plus'
    if (userId) {
      await supabase.from('profiles').update({ subscription_tier: plan }).eq('id', userId)
    }
  }

  return NextResponse.json({ received: true })
}
