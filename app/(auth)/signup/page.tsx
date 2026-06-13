"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthOptions } from '@/components/auth/AuthOptions'

function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName } },
    })
    setLoading(false)
    if (authError) {
      setError(authError.message)
      return
    }
    await fetch('/api/guest/clear', { method: 'POST' })
    router.push('/projects')
    router.refresh()
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Create your account</h1>

        <AuthOptions />

        <p className="auth-options__divider">
          <span>email</span>
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            Display name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error && <p className="auth-card__error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Sign up with email'}
          </button>
        </form>
        <p className="auth-card__footer">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth-page">Loading…</div>}>
      <SignupForm />
    </Suspense>
  )
}
