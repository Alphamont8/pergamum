import type { SupabaseClient } from '@supabase/supabase-js'
import { AUTH_NEXT_COOKIE } from '@/lib/auth/constants'

export type OAuthProvider = 'google'

export async function signInWithOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider,
  redirectTo?: string,
) {
  if (typeof window === 'undefined') {
    throw new Error('OAuth must be started in the browser')
  }

  const origin = window.location.origin
  const next = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/'

  // Keep redirectTo free of query params so Supabase redirect URL matching is reliable.
  document.cookie = `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)};path=/;max-age=600;SameSite=Lax`

  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback`,
      skipBrowserRedirect: false,
    },
  })
}
