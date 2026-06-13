import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth/session'
import { getStripe, PLAN_PRICE_IDS } from '@/lib/stripe/client'

const bodySchema = z.object({
  plan: z.enum(['Plus', 'Pro', 'Max']),
})

export async function POST(request: Request) {
  const { supabase, user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const priceId = PLAN_PRICE_IDS[parsed.data.plan]
  if (!priceId) {
    return NextResponse.json({ error: 'Price not configured' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  const stripe = getStripe()
  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const origin = request.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing?canceled=1`,
    metadata: { supabase_user_id: user.id, plan: parsed.data.plan },
  })

  return NextResponse.json({ url: session.url })
}
