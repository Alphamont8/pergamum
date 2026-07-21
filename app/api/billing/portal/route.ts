import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import {
  getCustomerPortalUrl,
  isLemonConfigured,
} from '@/lib/lemonsqueezy/client'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  if (!isLemonConfigured()) {
    return NextResponse.json({ error: 'Billing is not configured.' }, { status: 503 })
  }

  const service = await createServiceClient()
  const { data: subscription } = await service
    .from('subscriptions')
    .select('billing_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!subscription?.billing_subscription_id) {
    return NextResponse.json({ error: 'No billing account was found.' }, { status: 404 })
  }

  // Manual / seed subscriptions have no Lemon portal.
  if (
    subscription.billing_subscription_id.startsWith('sub_manual_') ||
    subscription.billing_subscription_id.startsWith('sub_dev_')
  ) {
    return NextResponse.json(
      { error: 'This Pro plan is managed outside of checkout.' },
      { status: 400 },
    )
  }

  const url = await getCustomerPortalUrl(subscription.billing_subscription_id)
  if (!url) {
    return NextResponse.json(
      { error: "We couldn't open the billing portal. Please try again." },
      { status: 502 },
    )
  }

  return NextResponse.json({ url })
}
