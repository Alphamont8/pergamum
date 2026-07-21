import type { CookieOptions } from '@supabase/ssr'
import { createServerClient } from '@supabase/ssr'
import { AUTH_NEXT_COOKIE } from '@/lib/auth/constants'
import { GUEST_COOKIE } from '@/lib/guest/constants'
import { NextResponse, type NextRequest } from 'next/server'

type PendingCookie = { value: string; options?: CookieOptions }

/** Supabase sometimes sends a Domain attribute that browsers reject on localhost. */
function sanitizeCookieOptions(options?: CookieOptions): CookieOptions | undefined {
  if (!options) return options
  const { domain: _domain, name: _name, ...rest } = options as CookieOptions & {
    domain?: string
    name?: string
  }
  return rest
}

function applyCookies(
  target: NextResponse,
  pendingCookies: Map<string, PendingCookie>,
) {
  pendingCookies.forEach(({ value, options }, name) => {
    const safe = sanitizeCookieOptions(options)
    if (value) {
      target.cookies.set(name, value, safe)
    } else {
      target.cookies.set(name, '', { ...safe, maxAge: 0 })
    }
  })
}

/**
 * OAuth / magic-link callback. Runs in a Node Route Handler so session cookies
 * are written onto the redirect response before it is sent.
 */
export async function handleAuthCallback(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  const nextFromQuery = searchParams.get('next')
  const nextFromCookie = request.cookies.get(AUTH_NEXT_COOKIE)?.value
  const nextRaw = nextFromQuery ?? (nextFromCookie ? decodeURIComponent(nextFromCookie) : '/')
  const next = nextRaw.startsWith('/') ? nextRaw : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=config`)
  }

  const pendingCookies = new Map<string, PendingCookie>()
  let redirectPath = next
  let response = NextResponse.redirect(`${origin}${redirectPath}`)

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          const safe = sanitizeCookieOptions(options)
          pendingCookies.set(name, { value, options: safe })
        })
        response = NextResponse.redirect(`${origin}${redirectPath}`)
        applyCookies(response, pendingCookies)
      },
    },
  })

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const user = data.session?.user
  if (user) {
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
    response = NextResponse.redirect(`${origin}${redirectPath}`)
    applyCookies(response, pendingCookies)
  }

  response.cookies.set(AUTH_NEXT_COOKIE, '', { path: '/', maxAge: 0 })
  response.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
  return response
}
