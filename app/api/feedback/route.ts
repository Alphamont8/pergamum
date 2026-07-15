import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const body = (await request.json()) as {
    message?: string
    email?: string | null
  }

  const message = (body.message ?? '').trim()
  if (message.length < 10) {
    return NextResponse.json(
      { error: 'Please write at least 10 characters.' },
      { status: 400 },
    )
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: 'That message is too long.' }, { status: 400 })
  }

  const email = (body.email ?? '').trim() || null
  const service = await createServiceClient()

  // Prefer a feedback table when present; otherwise log for ops.
  const { error } = await service.from('feedback').insert({
    user_id: user.id,
    message,
    email,
  })

  if (error) {
    console.info('[feedback]', {
      userId: user.id,
      email,
      message: message.slice(0, 500),
      dbError: error.message,
    })
    // Still accept feedback even if the table is not migrated yet.
    if (!/relation .*feedback.* does not exist/i.test(error.message) && error.code !== '42P01') {
      // Non-missing-table errors: still soft-succeed for UX, but surface in logs.
    }
  }

  return NextResponse.json({ ok: true })
}
