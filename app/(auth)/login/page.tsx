"use client"

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthOptions } from '@/components/auth/AuthOptions'
import { LoginShell } from '@/components/auth/LoginShell'
import '@/components/auth/LoginShell.css'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    await fetch('/api/guest/clear', { method: 'POST' })
    const redirect = searchParams.get('redirect') || '/projects'
    router.push(redirect)
    router.refresh()
  }

  return (
    <LoginShell
      title="Welcome back"
      lead="Use the same workspace you will see after sign-in—Blueprint, Outline, Draft, and References—with cloud sync when you use email or Google."
    >
      <AuthOptions />

      <p className="auth-options__divider">
        <span>or use email</span>
      </p>

      <form className="login-email-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@school.edu"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>
        {searchParams.get('error') === 'config' && (
          <p className="auth-card__error">
            Server configuration is incomplete. Add Supabase URL and anon key to{' '}
            <code>.env.local</code> (see <code>.env.example</code>), then restart the dev server.
          </p>
        )}
        {error && <p className="auth-card__error">{error}</p>}
        <button type="submit" className="login-email-form__submit" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in with email'}
        </button>
      </form>

      <p className="login-panel__footer">
        No account? <Link href="/signup">Create one</Link>
      </p>
    </LoginShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-app" style={{ alignItems: 'center', justifyContent: 'center' }}>
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
