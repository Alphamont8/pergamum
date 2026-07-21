import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  createLemonCheckout,
  isLemonConfigured,
  variantIdForPro,
} from '@/lib/lemonsqueezy/client'
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
    .select('billing_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    existingSubscription &&
    ['trialing', 'active', 'past_due'].includes(existingSubscription.status)
  ) {
    return NextResponse.json(
      { error: 'You already have a Pro subscription. Manage it from the Upgrade page.' },
      { status: 409 },
    )
  }

  const origin = getAppUrl()
  const checkout = await createLemonCheckout({
    variantId,
    userId: user.id,
    email: user.email,
    custom: {
      supabase_user_id: user.id,
      plan: 'pro',
      billing_interval: interval,
    },
    redirectUrl: `${origin}/upgrade?success=1`,
  })

  if (!checkout) {
    return NextResponse.json(
      { error: "We couldn't start checkout. Please try again." },
      { status: 502 },
    )
  }

  return NextResponse.json({ url: checkout.url })
}
