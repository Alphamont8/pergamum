import { createServerClient } from '@supabase/ssr'
import { handleAuthCallback } from '@/lib/supabase/auth-callback'
import {
  applyPendingCookies,
  createSupabaseRequestClient,
  type PendingCookie,
} from '@/lib/supabase/request-client'
import { NextResponse, type NextRequest } from 'next/server'

/** Always public (no auth required). */
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/api/webhooks/stripe',
  '/privacy',
  '/terms',
  '/cookies',
]

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  // OAuth / magic-link callback: exchange code before any getUser() refresh logic.
  // Running getUser() here can mutate PKCE verifier cookies and break the first login.
  if (path === '/auth/callback') {
    return handleAuthCallback(request)
  }

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

  const pendingCookies = new Map<string, PendingCookie>()

  let user = null
  try {
    const supabase = createSupabaseRequestClient(request, pendingCookies)

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    /* continue without session */
  }

  const nextWithCookies = () =>
    applyPendingCookies(NextResponse.next({ request }), pendingCookies)

  // Logged-in users leaving login → home (or redirect param)
  if (user && (path === '/login' || path === '/signup')) {
    const url = request.nextUrl.clone()
    const next = url.searchParams.get('redirect') || '/'
    url.pathname = next.startsWith('/') ? next : '/'
    url.search = ''
    return applyPendingCookies(NextResponse.redirect(url), pendingCookies)
  }

  // Everything except public auth routes requires sign-in
  if (!user && !isPublic(path)) {
    if (path.startsWith('/api/')) {
      return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    if (path !== '/') url.searchParams.set('redirect', path)
    return applyPendingCookies(NextResponse.redirect(url), pendingCookies)
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
        return applyPendingCookies(NextResponse.redirect(url), pendingCookies)
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
        return applyPendingCookies(NextResponse.redirect(url), pendingCookies)
      }
    } catch {
      /* continue */
    }
  }

  return nextWithCookies()
}
