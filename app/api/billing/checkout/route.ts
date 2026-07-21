import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CITES_PACKS, type CitesPack } from '@/lib/cites/packs'
import {
  createLemonCheckout,
  isLemonConfigured,
  variantIdForPack,
} from '@/lib/lemonsqueezy/client'
import { getAppUrl } from '@/lib/site'

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

  const variantId = variantIdForPack(pack)
  if (!variantId || !isLemonConfigured()) {
    return NextResponse.json(
      { error: "Checkout isn't available for this pack yet." },
      { status: 503 },
    )
  }

  const meta = CITES_PACKS[pack]
  const origin = getAppUrl()
  const checkout = await createLemonCheckout({
    variantId,
    userId: user.id,
    email: user.email,
    custom: {
      supabase_user_id: user.id,
      pack,
      cites: String(meta.cites),
    },
    redirectUrl: `${origin}/cites?success=1`,
  })

  if (!checkout) {
    return NextResponse.json(
      { error: "We couldn't start checkout. Please try again." },
      { status: 502 },
    )
  }

  const service = await createServiceClient()
  await service.from('purchases').insert({
    user_id: user.id,
    checkout_id: checkout.checkoutId,
    pack,
    cites: meta.cites,
    amount_cents: meta.amountCents,
    status: 'pending',
  })

  return NextResponse.json({ url: checkout.url })
}
