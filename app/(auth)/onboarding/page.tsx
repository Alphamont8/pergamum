'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { SchoolCombobox, type SchoolOption } from '@/components/ui/SchoolCombobox'
import './onboarding.css'

export default function OnboardingPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [schoolQuery, setSchoolQuery] = useState('')
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean
    available: boolean | null
    reason: string | null
  }>({ checking: false, available: null, reason: null })

  useEffect(() => {
    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (cleaned.length < 3) {
      setUsernameStatus({
        checking: false,
        available: null,
        reason: cleaned.length === 0 ? null : 'Use at least 3 lowercase characters.',
      })
      return
    }

    let cancelled = false
    setUsernameStatus((s) => ({ ...s, checking: true }))
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/username/check?username=${encodeURIComponent(cleaned)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        setUsernameStatus({
          checking: false,
          available: Boolean(data.available),
          reason: data.reason ?? null,
        })
      } catch {
        if (!cancelled) {
          setUsernameStatus({ checking: false, available: null, reason: 'We couldn\u2019t check that username.' })
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [username])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)

    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (cleaned.length < 3) {
      setError('Username must be at least 3 characters (lowercase letters, numbers, underscore).')
      setBusy(false)
      return
    }
    if (usernameStatus.available === false) {
      setError(usernameStatus.reason ?? 'That username is already taken.')
      setBusy(false)
      return
    }

    let referralCode: string | null = null
    try {
      referralCode = sessionStorage.getItem('pergamum_ref')
    } catch {
      /* ignore */
    }

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: cleaned,
        schoolId,
        referralCode,
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'We couldn\u2019t complete onboarding.')
      setBusy(false)
      return
    }

    try {
      sessionStorage.removeItem('pergamum_ref')
    } catch {
      /* ignore */
    }

    router.replace('/')
    router.refresh()
  }

  return (
    <main className="onboarding-page">
      <form className="onboarding-card" onSubmit={onSubmit}>
        <p className="login-kicker">Almost There</p>
        <h1>Set Up Your Profile</h1>
        <p className="pg-muted">
          Pick a username that&rsquo;s yours alone. Adding your university is optional, but it
          unlocks your school&rsquo;s leaderboard.
        </p>

        <label>
          <span>Username</span>
          <input
            required
            minLength={3}
            maxLength={24}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="alex_writes"
          />
          {usernameStatus.checking ? (
            <span className="username-hint">Checking availability…</span>
          ) : null}
          {!usernameStatus.checking && usernameStatus.available === true ? (
            <span className="username-hint is-ok">That username is available.</span>
          ) : null}
          {!usernameStatus.checking && usernameStatus.reason && usernameStatus.available !== true ? (
            <span className="username-hint is-bad">{usernameStatus.reason}</span>
          ) : null}
        </label>

        <SchoolCombobox
          label="University (optional)"
          valueId={schoolId}
          displayValue={schoolQuery}
          onDisplayChange={setSchoolQuery}
          onClear={() => setSchoolId(null)}
          onSelect={(s: SchoolOption) => setSchoolId(s.id)}
        />

        {error ? <p className="login-error">{error}</p> : null}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={busy || usernameStatus.available === false || usernameStatus.checking}
        >
          Continue
        </Button>
      </form>
    </main>
  )
}
