import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  createLemonCheckout,
  isLemonConfigured,
  variantIdForPro,
} from '@/lib/lemonsqueezy/client'
import { SEMESTER_PRO_AMOUNT_CENTS } from '@/lib/billing/plans'
import { getAppUrl } from '@/lib/site'

const bodySchema = z.object({
  interval: z.enum(['month', 'semester']),
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
  const variantId = variantIdForPro(interval)
  if (!variantId || !isLemonConfigured()) {
    return NextResponse.json(
      { error: 'Pro checkout is not configured for this billing interval.' },
      { status: 503 },
    )
  }

  const service = await createServiceClient()
  const { data: existingSubscription } = await service
    .from('subscriptions')
    .select('billing_subscription_id, status, billing_interval')
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    existingSubscription &&
    ['trialing', 'active', 'past_due'].includes(existingSubscription.status)
  ) {
    return NextResponse.json(
      {
        error:
          existingSubscription.billing_interval === 'semester'
            ? 'You already have Semester Pro. It ends at the end of your term.'
            : 'You already have a Pro subscription. Manage it from the Upgrade page.',
      },
      { status: 409 },
    )
  }

  const origin = getAppUrl()
  const redirectUrl = `${origin}/upgrade?success=1`

  if (interval === 'semester') {
    const checkout = await createLemonCheckout({
      variantId,
      userId: user.id,
      email: user.email,
      custom: {
        supabase_user_id: user.id,
        plan: 'pro',
        billing_interval: 'semester',
      },
      redirectUrl,
    })

    if (!checkout) {
      return NextResponse.json(
        { error: "We couldn't start checkout. Please try again." },
        { status: 502 },
      )
    }

    const { error: purchaseError } = await service.from('purchases').upsert(
      {
        user_id: user.id,
        checkout_id: checkout.checkoutId,
        pack: 'semester',
        cites: 200,
        amount_cents: SEMESTER_PRO_AMOUNT_CENTS,
        status: 'pending',
      },
      { onConflict: 'checkout_id' },
    )
    if (purchaseError) {
      return NextResponse.json(
        { error: "We couldn't start checkout. Please try again." },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: checkout.url })
  }

  const checkout = await createLemonCheckout({
    variantId,
    userId: user.id,
    email: user.email,
    custom: {
      supabase_user_id: user.id,
      plan: 'pro',
      billing_interval: interval,
    },
    redirectUrl,
  })

  if (!checkout) {
    return NextResponse.json(
      { error: "We couldn't start checkout. Please try again." },
      { status: 502 },
    )
  }

  return NextResponse.json({ url: checkout.url })
}
