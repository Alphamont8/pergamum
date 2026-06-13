import { createClient } from '@/lib/supabase/server'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/projects'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`)
      response.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
