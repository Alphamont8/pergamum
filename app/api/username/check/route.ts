import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const raw = (new URL(request.url).searchParams.get('username') ?? '').trim().toLowerCase()
  const username = raw.replace(/[^a-z0-9_]/g, '')

  if (username.length < 3) {
    return NextResponse.json({
      available: false,
      username,
      reason: 'Username must be at least 3 characters (lowercase letters, numbers, underscore).',
    })
  }
  if (username.length > 24 || !/^[a-z0-9_]{3,24}$/.test(username)) {
    return NextResponse.json({
      available: false,
      username,
      reason: 'Use 3 to 24 lowercase letters, numbers, or underscores.',
    })
  }

  const service = await createServiceClient()
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  const available = !existing || existing.id === user.id
  return NextResponse.json({
    available,
    username,
    reason: available ? null : 'That username is already taken.',
  })
}
