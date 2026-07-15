'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signInWithOAuth } from '@/lib/auth/oauth'
import { Button } from '@/components/ui/Button'
import './login.css'

type AuthMode = 'signin' | 'signup' | 'forgot'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/'
  const refFromUrl = searchParams.get('ref') ?? ''
  const errorParam = searchParams.get('error')

  const [mode, setMode] = useState<AuthMode>(refFromUrl ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [referralCode, setReferralCode] = useState(refFromUrl.toUpperCase())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const supabase = useMemo(() => {
    try {
      return createClient()
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    if (refFromUrl) {
      setMode('signup')
      setReferralCode(refFromUrl.toUpperCase())
    }
  }, [refFromUrl])

  useEffect(() => {
    if (errorParam === 'session') {
      setMessage('Your session expired. Please sign in again.')
    }
  }, [errorParam])

  function storeReferralIfSignup() {
    if (mode !== 'signup' || !referralCode.trim()) return
    try {
      sessionStorage.setItem('pergamum_ref', referralCode.trim().toUpperCase())
    } catch {
      /* ignore */
    }
  }

  async function onGoogle() {
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and ANON_KEY.')
      return
    }
    setBusy(true)
    setMessage(null)
    storeReferralIfSignup()
    try {
      const { error } = await signInWithOAuth(supabase, 'google', redirect)
      if (error) {
        setMessage(
          error.message.includes('provider')
            ? 'Google sign-in is not enabled in Supabase Auth Providers.'
            : error.message,
        )
        setBusy(false)
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Google sign-in didn\u2019t work. Try again.')
      setBusy(false)
    }
  }

  function validateForm(): boolean {
    const next: { email?: string; password?: string } = {}
    const trimmedEmail = email.trim()

    if (!trimmedEmail) {
      next.email = 'Enter your email address.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = 'That does not look like a valid email.'
    }

    if (mode !== 'forgot') {
      if (!password) {
        next.password = 'Enter your password.'
      } else if (password.length < 6) {
        next.password = 'Password must be at least 6 characters.'
      }
    }

    setFieldErrors(next)
    if (next.email || next.password) {
      setMessage(null)
      return false
    }
    return true
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and ANON_KEY.')
      return
    }
    if (!validateForm()) return
    setBusy(true)
    setMessage(null)
    try {
      const origin = window.location.origin
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`,
      })
      if (error) {
        setMessage(error.message)
        setBusy(false)
        return
      }
      setMessage('If an account exists for that email, we sent a reset link. Check your inbox.')
      setBusy(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "We couldn't send a reset link.")
      setBusy(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'forgot') {
      await onForgot(e)
      return
    }
    if (!supabase) {
      setMessage('Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and ANON_KEY.')
      return
    }
    if (!validateForm()) return
    setBusy(true)
    setMessage(null)
    storeReferralIfSignup()

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`,
          },
        })
        if (error) {
          setMessage(error.message)
          setBusy(false)
          return
        }
        if (data.session) {
          router.replace('/onboarding')
          router.refresh()
          return
        }
        setMessage('Almost there! Check your email to confirm your account, then sign in.')
        setBusy(false)
        return
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(
          error.message === 'Invalid login credentials'
            ? 'That email and password don\u2019t match. If you just signed up, confirm your email first.'
            : error.message,
        )
        setBusy(false)
        return
      }
      router.replace(redirect.startsWith('/') ? redirect : '/')
      router.refresh()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sign-in didn\u2019t work. Try again.')
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-product" aria-label="About Pergamum">
        <div className="login-product__wash" aria-hidden>
          <span className="login-wash login-wash--a" />
          <span className="login-wash login-wash--b" />
          <span className="login-wash login-wash--c" />
          <span className="login-wash login-wash--veil" />
        </div>
        <div className="login-product__copy">
          <p className="login-brand">Pergamum</p>
          <h1 className="login-product__headline">Citations, made with magic.</h1>
          <p className="login-product__body">
            Drop in your draft, pick a referencing style, and we will track down real sources for
            every claim. You get clean in-text citations and a ready-made bibliography, so you can
            spend less time hunting for references and more time actually writing.
          </p>
          <ul className="login-product__points">
            <li>Searches from 250M+ scholarly works and the entire internet</li>
            <li>Supports APA, MLA, Chicago, Harvard, and more</li>
            <li>Bibliography formatted and ready to copy</li>
          </ul>
        </div>
        <div className="login-product__art" aria-hidden>
          <div className="login-art">
            <div className="login-art__chip login-art__chip--style">APA 7</div>
            <div className="login-art__chip login-art__chip--source">Scholarly</div>
            <div className="login-art__chip login-art__chip--check">Verified</div>
            <div className="login-art__sheet login-art__sheet--back" />
            <div className="login-art__sheet login-art__sheet--mid" />
            <div className="login-art__sheet login-art__sheet--front">
              <span className="login-art__line login-art__line--title" />
              <span className="login-art__line" />
              <span className="login-art__line login-art__line--short" />
              <span className="login-art__cite">(Smith, 2024)</span>
              <span className="login-art__line" />
              <span className="login-art__line login-art__line--mid" />
              <div className="login-art__biblio">
                <span className="login-art__biblio-label">References</span>
                <span className="login-art__line login-art__line--tiny" />
                <span className="login-art__line login-art__line--tiny login-art__line--short" />
              </div>
            </div>
            <div className="login-art__glow" />
          </div>
        </div>
      </section>

      <section className="login-auth">
        <div className="login-card">
          <h2>
            {mode === 'signin'
              ? 'Welcome Back'
              : mode === 'signup'
                ? 'Create Your Account'
                : 'Reset Password'}
          </h2>
          <p className="pg-muted">
            {mode === 'signin'
              ? 'Sign in and pick up right where you left off.'
              : mode === 'signup'
                ? 'Set up your account and start citing in minutes.'
                : 'Enter your email and we will send a reset link.'}
          </p>

          {errorParam === 'config' ? (
            <p className="login-error">
              Supabase is not configured. Check your environment variables.
            </p>
          ) : null}
          {errorParam === 'auth' ? (
            <p className="login-error">
              Authentication failed. Confirm Google is enabled in Supabase and that{' '}
              <code>
                {typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback
              </code>{' '}
              is listed under Auth → URL Configuration.
            </p>
          ) : null}

          {mode !== 'forgot' ? (
            <>
              <Button
                variant="accent"
                size="lg"
                className="login-google"
                onClick={onGoogle}
                disabled={busy}
              >
                Continue with Google
              </Button>

              <div className="login-divider">
                <span>Or</span>
              </div>
            </>
          ) : null}

          <form className="login-form" onSubmit={onSubmit} noValidate>
            <label>
              <span>Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) {
                    setFieldErrors((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              />
              {fieldErrors.email ? (
                <span id="login-email-error" className="login-field-error" role="alert">
                  {fieldErrors.email}
                </span>
              ) : null}
            </label>
            {mode !== 'forgot' ? (
              <label>
                <span>Password</span>
                <input
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (fieldErrors.password) {
                      setFieldErrors((prev) => ({ ...prev, password: undefined }))
                    }
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                />
                {fieldErrors.password ? (
                  <span id="login-password-error" className="login-field-error" role="alert">
                    {fieldErrors.password}
                  </span>
                ) : null}
              </label>
            ) : null}
            {mode === 'signup' ? (
              <label>
                <span>Referral Code (optional)</span>
                <input
                  type="text"
                  maxLength={6}
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
              </label>
            ) : null}
            {mode === 'signin' ? (
              <button
                type="button"
                className="login-forgot"
                onClick={() => {
                  setMode('forgot')
                  setFieldErrors({})
                  setMessage(null)
                  setPassword('')
                }}
              >
                Forgot password?
              </button>
            ) : null}
            <Button type="submit" variant="primary" size="lg" disabled={busy}>
              {busy
                ? mode === 'forgot'
                  ? 'Sending…'
                  : mode === 'signin'
                    ? 'Signing In…'
                    : 'Signing Up…'
                : mode === 'signin'
                  ? 'Sign In'
                  : mode === 'signup'
                    ? 'Sign Up'
                    : 'Send Reset Link'}
            </Button>
          </form>

          {message ? <p className="login-message">{message}</p> : null}

          <button
            type="button"
            className="login-switch"
            onClick={() => {
              if (mode === 'forgot') {
                setMode('signin')
              } else {
                setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
              }
              setFieldErrors({})
              setMessage(null)
            }}
          >
            {mode === 'signin'
              ? 'Need an account? Sign up'
              : mode === 'signup'
                ? 'Already have an account? Sign in'
                : 'Back to sign in'}
          </button>

          <nav className="login-legal" aria-label="Legal">
            <Link href="/privacy">Privacy</Link>
            <span aria-hidden>·</span>
            <Link href="/terms">Terms</Link>
            <span aria-hidden>·</span>
            <Link href="/cookies">Cookies</Link>
          </nav>
        </div>
      </section>
    </main>
  )
}
