import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export type PendingCookie = {
  name: string
  value: string
  options?: Record<string, unknown>
}

/** Supabase server client that accumulates every setAll batch (chunked auth cookies). */
export function createSupabaseRequestClient(
  request: NextRequest,
  pendingCookies: Map<string, PendingCookie>,
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase env vars')
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[],
      ) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          pendingCookies.set(name, { name, value, options })
        })
      },
    },
  })
}

export function applyPendingCookies(
  response: NextResponse,
  pendingCookies: Map<string, PendingCookie>,
) {
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })
  return response
}
