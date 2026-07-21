import { createServerClient } from '@supabase/ssr'
import { syncProfileAvatarIfMissing } from '@/lib/auth/avatar'
import { GUEST_COOKIE } from '@/lib/guest/session'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') ? nextParam : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`)
  }

  // Session cookies must be written onto the redirect response itself.
  // Using cookies() + a separate NextResponse.redirect() often drops them on the first login.
  let redirectPath = next
  let response = NextResponse.redirect(`${origin}${redirectPath}`)

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.redirect(`${origin}${redirectPath}`)
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  if (redirectPath !== next) {
    const finalResponse = NextResponse.redirect(`${origin}${redirectPath}`)
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value)
    })
    finalResponse.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
    return finalResponse
  }

  response.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
