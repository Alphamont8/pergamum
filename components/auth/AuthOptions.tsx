"use client"

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signInWithOAuth, type OAuthProvider } from '@/lib/auth/oauth'
import { GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'
import { GoogleSignInButton } from './GoogleSignInButton'
import './AuthOptions.css'

export function AuthOptions() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null)
  const [guestLoading, setGuestLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const guestWorkspacePath = `/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`

  async function handleOAuth(provider: OAuthProvider) {
    setOauthLoading(provider)
    setError(null)
    try {
      const supabase = createClient()
      const redirect = searchParams.get('redirect') || '/projects'
      const { error: oauthError } = await signInWithOAuth(supabase, provider, redirect)
      if (oauthError) setError(oauthError.message)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OAuth failed')
    } finally {
      setOauthLoading(null)
    }
  }

  async function handleGuest() {
    setGuestLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/guest/start', { method: 'POST', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Could not start guest session')
      }
      const body = (await res.json().catch(() => ({}))) as { redirect?: string }
      const target = body.redirect ?? guestWorkspacePath
      window.location.assign(target)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open workspace')
      setGuestLoading(false)
    }
  }

  return (
    <div className="auth-options">
      <GoogleSignInButton
        onClick={() => handleOAuth('google')}
        disabled={guestLoading}
        loading={oauthLoading === 'google'}
      />

      <p className="auth-options__divider">
        <span>or</span>
      </p>

      <button
        type="button"
        className="auth-options__guest-btn"
        disabled={!!oauthLoading || guestLoading}
        onClick={handleGuest}
      >
        {guestLoading ? 'Opening workspace…' : 'Continue without an account'}
      </button>
      <p className="auth-options__guest-hint">
        Opens the full Pergamum workspace on the <strong>Basic</strong> plan. Progress stays in
        this browser until you{' '}
        <Link href="/signup">create an account</Link>.
      </p>

      {error && <p className="auth-card__error">{error}</p>}
    </div>
  )
}
