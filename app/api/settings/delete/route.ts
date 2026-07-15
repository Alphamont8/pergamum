import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe/client'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const service = await createServiceClient()
  const { data: subscription } = await service
    .from('subscriptions')
    .select('stripe_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    subscription &&
    !['canceled', 'incomplete_expired'].includes(subscription.status)
  ) {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: 'Billing is unavailable, so the active subscription could not be canceled.' },
        { status: 503 },
      )
    }
    try {
      await getStripe().subscriptions.cancel(subscription.stripe_subscription_id)
    } catch (err) {
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `The subscription could not be canceled: ${err.message}`
              : 'The subscription could not be canceled.',
        },
        { status: 502 },
      )
    }
  }

  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
