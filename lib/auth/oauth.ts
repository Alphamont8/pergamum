import type { SupabaseClient } from '@supabase/supabase-js'

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

  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: false,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
}
