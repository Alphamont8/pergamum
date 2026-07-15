import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'
import { priceIdForPro } from '@/lib/billing/plans'
import { getAppUrl } from '@/lib/site'

const bodySchema = z.object({
  interval: z.enum(['month', 'year']),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "That billing interval isn't valid." }, { status: 400 })
  }

  const { interval } = parsed.data
  const priceId = priceIdForPro(interval)
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Pro checkout is not configured for this billing interval.' },
      { status: 503 },
    )
  }

  const service = await createServiceClient()
  const [{ data: profile }, { data: existingSubscription }] = await Promise.all([
    service
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single(),
    service
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  if (
    existingSubscription &&
    ['trialing', 'active', 'past_due'].includes(existingSubscription.status)
  ) {
    return NextResponse.json(
      { error: 'You already have a Pro subscription. Manage it from the Upgrade page.' },
      { status: 409 },
    )
  }

  const stripe = getStripe()
  let customerId = profile?.stripe_customer_id ?? undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    const { error } = await service.rpc('set_stripe_customer', {
      p_user_id: user.id,
      p_customer_id: customerId,
    })
    if (error) {
      return NextResponse.json({ error: "We couldn't connect your billing profile." }, { status: 500 })
    }
  }

  const origin = getAppUrl()
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/upgrade?success=1`,
    cancel_url: `${origin}/upgrade?cancelled=1`,
    metadata: {
      supabase_user_id: user.id,
      plan: 'pro',
      billing_interval: interval,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        plan: 'pro',
        billing_interval: interval,
      },
    },
  })

  return NextResponse.json({ url: session.url })
}
