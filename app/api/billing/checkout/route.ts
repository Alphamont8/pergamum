import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CITES_PACKS, getStripe, priceIdForPack, type CitesPack } from '@/lib/stripe/client'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const body = (await request.json()) as { pack?: CitesPack }
  const pack = body.pack
  if (!pack || !(pack in CITES_PACKS)) {
    return NextResponse.json({ error: "That Cites pack isn't valid." }, { status: 400 })
  }

  const priceId = priceIdForPack(pack)
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Checkout isn't available for this pack yet." },
      { status: 503 },
    )
  }

  const meta = CITES_PACKS[pack]
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, username')
    .eq('id', user.id)
    .single()

  const stripe = getStripe()
  let customerId = profile?.stripe_customer_id ?? undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id
    const service = await createServiceClient()
    await service.rpc('set_stripe_customer', {
      p_user_id: user.id,
      p_customer_id: customerId,
    })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/cites?success=1`,
    cancel_url: `${origin}/cites?cancelled=1`,
    metadata: {
      supabase_user_id: user.id,
      pack,
      cites: String(meta.cites),
    },
  })

  const service = await createServiceClient()
  await service.from('purchases').insert({
    user_id: user.id,
    stripe_session_id: session.id,
    pack,
    cites: meta.cites,
    amount_cents: meta.amountCents,
    status: 'pending',
  })

  return NextResponse.json({ url: session.url })
}
