'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import '../login/login.css'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setError('Supabase is not configured.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        setBusy(false)
        return
      }
      setMessage('Password updated. Taking you in…')
      router.replace('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't update your password.")
      setBusy(false)
    }
  }

  return (
    <main className="login-page login-page--solo">
      <section className="login-auth login-auth--solo">
        <div className="login-card">
          <h2>Choose a New Password</h2>
          <p className="pg-muted">Pick something memorable that is at least 6 characters.</p>
          <form className="login-form" onSubmit={onSubmit}>
            <label>
              <span>New Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
              />
            </label>
            <label>
              <span>Confirm Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={6}
              />
            </label>
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy ? 'Saving…' : 'Update Password'}
            </Button>
          </form>
          {error ? <p className="login-error">{error}</p> : null}
          {message ? <p className="login-message">{message}</p> : null}
        </div>
      </section>
    </main>
  )
}
