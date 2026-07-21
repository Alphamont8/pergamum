import { syncProfileAvatarIfMissing } from '@/lib/auth/avatar'
import { GUEST_COOKIE } from '@/lib/guest/session'
import {
  applyPendingCookies,
  createSupabaseRequestClient,
  type PendingCookie,
} from '@/lib/supabase/request-client'
import { NextResponse, type NextRequest } from 'next/server'

export async function handleAuthCallback(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') ? nextParam : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(`${origin}/login?error=config`)
  }

  const pendingCookies = new Map<string, PendingCookie>()
  const supabase = createSupabaseRequestClient(request, pendingCookies)

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let redirectPath = next
  if (user) {
    const { createServiceClient } = await import('@/lib/supabase/server')
    const service = await createServiceClient()
    await syncProfileAvatarIfMissing(service, user.id, user.user_metadata)

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || profile.onboarding_complete === false) {
      redirectPath = '/onboarding'
    }
  }

  const response = NextResponse.redirect(`${origin}${redirectPath}`)
  applyPendingCookies(response, pendingCookies)
  response.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
