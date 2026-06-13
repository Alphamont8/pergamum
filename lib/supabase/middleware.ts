import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { GUEST_ONLY_MODE } from '@/lib/config/guest-only'
import { GUEST_COOKIE, GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'

const GUEST_WORKSPACE = `/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`

function applyGuestCookie(response: NextResponse) {
  response.cookies.set(GUEST_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
  return response
}

function handleGuestOnlyMode(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path === '/signup') {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return applyGuestCookie(NextResponse.redirect(url))
  }

  if (path === '/') {
    const url = request.nextUrl.clone()
    url.pathname = GUEST_WORKSPACE
    return applyGuestCookie(NextResponse.redirect(url))
  }

  if (
    path.startsWith('/projects') ||
    path.startsWith('/project/') ||
    path.startsWith('/settings') ||
    path.startsWith('/billing')
  ) {
    const url = request.nextUrl.clone()
    url.pathname = GUEST_WORKSPACE
    return applyGuestCookie(NextResponse.redirect(url))
  }

  return applyGuestCookie(NextResponse.next({ request }))
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (GUEST_ONLY_MODE) {
    return handleGuestOnlyMode(request)
  }

  const isGuest = request.cookies.get(GUEST_COOKIE)?.value === '1'

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    if (path.startsWith('/login') || path.startsWith('/signup')) {
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
        setAll(
          cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    })

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch {
    /* continue without session — public/guest routes still work */
  }

  const isAuthRoute =
    path.startsWith('/login') ||
    path.startsWith('/signup') ||
    path.startsWith('/auth/callback')
  const isPublicApi =
    path.startsWith('/api/webhooks') || path.startsWith('/api/guest/start')
  const isGuestRoute = path.startsWith('/guest')
  const isGuestAiApi = isGuest && path.startsWith('/api/ai')
  const isGuestSourcesApi = isGuest && path.startsWith('/api/sources')

  if (isGuestRoute && !isGuest) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  const isProtected =
    path.startsWith('/projects') ||
    path.startsWith('/settings') ||
    path.startsWith('/billing') ||
    path.startsWith('/project/') ||
    path.startsWith('/api/projects') ||
    path.startsWith('/api/ai') ||
    path.startsWith('/api/sources') ||
    path.startsWith('/api/billing')

  if (!user && isProtected && !isPublicApi && !isGuestRoute && !isGuestAiApi && !isGuestSourcesApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  if (user && isGuestRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/projects'
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute && !path.startsWith('/auth/callback')) {
    const url = request.nextUrl.clone()
    url.pathname = '/projects'
    const clearGuest = NextResponse.redirect(url)
    clearGuest.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
    return clearGuest
  }

  if (path === '/') {
    const url = request.nextUrl.clone()
    if (user) url.pathname = '/projects'
    else if (isGuest) url.pathname = GUEST_WORKSPACE
    else url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
