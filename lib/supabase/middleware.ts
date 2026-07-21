import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/** Always public (no auth required). */
const PUBLIC_PATHS = [
  '/login',
  '/api/webhooks/lemon-squeezy',
  '/privacy',
  '/terms',
  '/cookies',
]

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

function sanitizeCookieOptions(options?: Record<string, unknown>) {
  if (!options) return options
  const { domain: _d, name: _n, ...rest } = options
  return rest
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublic(path) || path.startsWith('/login')) {
      return NextResponse.next({ request })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'config')
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({ request })

  let user = null
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => {
            const safe = sanitizeCookieOptions(options)
            if (value) {
              supabaseResponse.cookies.set(name, value, safe)
            } else {
              supabaseResponse.cookies.set(name, '', { ...safe, maxAge: 0 })
            }
          })
        },
      },
    })

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    /* continue without session */
  }

  const redirectWithCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value)
    })
    return redirect
  }

  // Logged-in users leaving login → home (or redirect param)
  if (user && (path === '/login' || path === '/signup')) {
    const url = request.nextUrl.clone()
    const next = url.searchParams.get('redirect') || '/'
    url.pathname = next.startsWith('/') ? next : '/'
    url.search = ''
    return redirectWithCookies(url)
  }

  // Everything except public auth routes requires sign-in
  if (!user && !isPublic(path)) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (path !== '/') url.searchParams.set('redirect', path)
    return redirectWithCookies(url)
  }

  // Onboarding gate for authenticated users (skip public legal/auth routes)
  if (
    user &&
    !isPublic(path) &&
    !path.startsWith('/onboarding') &&
    !path.startsWith('/api/') &&
    !path.startsWith('/auth/')
  ) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {},
        },
      })
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .maybeSingle()

      if (profile && profile.onboarding_complete === false) {
        const url = request.nextUrl.clone()
        url.pathname = '/onboarding'
        return redirectWithCookies(url)
      }
    } catch {
      /* allow through if profile lookup fails */
    }
  }

  if (user && path.startsWith('/onboarding')) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll() {},
        },
      })
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.onboarding_complete) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return redirectWithCookies(url)
      }
    } catch {
      /* continue */
    }
  }

  return supabaseResponse
}
