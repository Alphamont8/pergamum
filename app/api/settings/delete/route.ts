import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cancelLemonSubscription, isLemonConfigured } from '@/lib/lemonsqueezy/client'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const service = await createServiceClient()
  const { data: subscription } = await service
    .from('subscriptions')
    .select('billing_subscription_id, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (
    subscription &&
    !['canceled', 'incomplete_expired'].includes(subscription.status)
  ) {
    if (
      !isLemonConfigured() &&
      !subscription.billing_subscription_id.startsWith('sub_manual_') &&
      !subscription.billing_subscription_id.startsWith('sub_dev_') &&
      !subscription.billing_subscription_id.startsWith('sem_ls_')
    ) {
      return NextResponse.json(
        { error: 'Billing is unavailable, so the active subscription could not be canceled.' },
        { status: 503 },
      )
    }
    try {
      const result = await cancelLemonSubscription(subscription.billing_subscription_id)
      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error
              ? `The subscription could not be canceled: ${result.error}`
              : 'The subscription could not be canceled.',
          },
          { status: 502 },
        )
      }
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
