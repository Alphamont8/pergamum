import type { SupabaseClient } from '@supabase/supabase-js'

export type OAuthProvider = 'google'

export async function signInWithOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider,
  redirectTo?: string,
) {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const next = redirectTo ?? '/projects'

  return supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: false,
    },
  })
}
