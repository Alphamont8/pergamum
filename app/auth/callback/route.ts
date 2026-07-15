import { createClient, createServiceClient } from '@/lib/supabase/server'
import { syncProfileAvatarIfMissing } from '@/lib/auth/avatar'
import { GUEST_COOKIE } from '@/lib/guest/session'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') ? nextParam : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      let dest = next
      if (user) {
        const service = await createServiceClient()
        await syncProfileAvatarIfMissing(service, user.id, user.user_metadata)

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', user.id)
          .maybeSingle()
        if (!profile || profile.onboarding_complete === false) {
          dest = '/onboarding'
        }
      }

      const response = NextResponse.redirect(`${origin}${dest}`)
      // Drop guest session cookie after real login
      response.cookies.set(GUEST_COOKIE, '', { path: '/', maxAge: 0 })
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
