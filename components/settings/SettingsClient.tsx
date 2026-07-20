'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select } from '@/components/ui/Select'
import { SchoolCombobox, type SchoolOption } from '@/components/ui/SchoolCombobox'
import { ProUpsellDialog } from '@/components/billing/ProUpsellDialog'
import { useTheme } from '@/components/theme/ThemeProvider'
import { planDisplayName, PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import { PRO_FEATURES_TRIAL_DAYS, type ProTrialSnapshot } from '@/lib/billing/proTrial.shared'
import { formatAppDate } from '@/lib/format/date'
import { REFERENCING_STYLES } from '@/utils/referencingStyle'
import type { ProUpsellFeature } from '@/lib/billing/proUpsell'
import type {
  BillingInterval,
  PlanTier,
  SourceRecency,
  SourceTier,
  SubscriptionStatus,
  ThemePreference,
} from '@/types'
import './settings.css'

type PrefsSnapshot = {
  defaultStyle: string
  defaultInText: boolean
  defaultSuggestCorrections: boolean
  defaultRecency: SourceRecency
  defaultSourceTier: SourceTier
  theme: ThemePreference
}

function prefsSnapshot(
  style: string,
  inText: boolean,
  suggest: boolean,
  recency: SourceRecency,
  sourceTier: SourceTier,
  theme: ThemePreference,
): PrefsSnapshot {
  return {
    defaultStyle: style,
    defaultInText: inText,
    defaultSuggestCorrections: suggest,
    defaultRecency: recency,
    defaultSourceTier: sourceTier,
    theme,
  }
}

function prefsEqual(a: PrefsSnapshot, b: PrefsSnapshot): boolean {
  return (
    a.defaultStyle === b.defaultStyle &&
    a.defaultInText === b.defaultInText &&
    a.defaultSuggestCorrections === b.defaultSuggestCorrections &&
    a.defaultRecency === b.defaultRecency &&
    a.defaultSourceTier === b.defaultSourceTier &&
    a.theme === b.theme
  )
}

export function SettingsClient({
  initial,
}: {
  initial: {
    username: string
    schoolId: string | null
    schoolLabel: string
    signInLabel: string
    signInEmail: string
    signInOAuthLabel: string | null
    defaultStyle: string
    defaultInText: boolean
    defaultSuggestCorrections: boolean
    defaultRecency: SourceRecency
    defaultSourceTier: SourceTier
    planTier: PlanTier
    citesBalance: number
    themePreference: ThemePreference
    canChangePassword: boolean
    hasBillingAccount: boolean
    trial: ProTrialSnapshot
    subscription: {
      status: SubscriptionStatus
      billingInterval: BillingInterval
      currentPeriodEnd: string | null
      cancelAtPeriodEnd: boolean
    } | null
  }
}) {
  const router = useRouter()
  const { setPreference } = useTheme()
  const suggestionsAvailable = initial.planTier === 'pro'
  const isPro = initial.planTier === 'pro'
  const isFeaturesTrial = initial.trial.phase === 'active'
  const showTrialConvert = initial.trial.showConvertPrompt
  const [upsell, setUpsell] = useState<{ feature: ProUpsellFeature; detail?: string } | null>(
    null,
  )
  const [username, setUsername] = useState(initial.username)
  const [schoolId, setSchoolId] = useState<string | null>(initial.schoolId)
  const [schoolQuery, setSchoolQuery] = useState(initial.schoolLabel)
  const [defaultStyle, setDefaultStyle] = useState(initial.defaultStyle)
  const [defaultInText, setDefaultInText] = useState(initial.defaultInText)
  const [defaultSuggestCorrections, setDefaultSuggestCorrections] = useState(
    suggestionsAvailable && initial.defaultSuggestCorrections,
  )
  const [defaultRecency, setDefaultRecency] = useState<SourceRecency>(initial.defaultRecency)
  const [defaultSourceTier, setDefaultSourceTier] = useState<SourceTier>(initial.defaultSourceTier)
  const [theme, setTheme] = useState<ThemePreference>(initial.themePreference)
  const [acknowledgedPrefs, setAcknowledgedPrefs] = useState<PrefsSnapshot>(() =>
    prefsSnapshot(
      initial.defaultStyle,
      initial.defaultInText,
      suggestionsAvailable && initial.defaultSuggestCorrections,
      initial.defaultRecency,
      initial.defaultSourceTier,
      initial.themePreference,
    ),
  )
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [emailEdit, setEmailEdit] = useState(initial.signInEmail === 'Not set' ? '' : initial.signInEmail)
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean
    available: boolean | null
    reason: string | null
  }>({ checking: false, available: true, reason: null })
  const prefsReady = useRef(false)

  const profileDirty =
    username.trim().toLowerCase() !== (initial.username || '') ||
    schoolId !== initial.schoolId ||
    Boolean(password)

  const currentPrefs = prefsSnapshot(
    defaultStyle,
    defaultInText,
    defaultSuggestCorrections,
    defaultRecency,
    defaultSourceTier,
    theme,
  )
  const prefsAppearDirty = !prefsEqual(currentPrefs, acknowledgedPrefs)
  const saveEnabled = profileDirty || prefsAppearDirty

  const periodEnd = initial.subscription?.currentPeriodEnd
    ? formatAppDate(initial.subscription.currentPeriodEnd)
    : null

  const trialEnd = initial.trial.endsAt ? formatAppDate(initial.trial.endsAt) : null

  const planTierLabel = isFeaturesTrial ? 'Pro Trial' : planDisplayName(initial.planTier)
  const upgradeLabel =
    isFeaturesTrial || showTrialConvert
      ? 'Keep Pro'
      : isPro
        ? 'Manage Plan'
        : 'Compare Plans'

  const planStatus = (() => {
    if (isFeaturesTrial) return { label: 'Features Trial', tone: 'accent' as const }
    if (showTrialConvert) return { label: 'Trial Ended', tone: 'warn' as const }
    if (isPro) {
      if (initial.subscription?.cancelAtPeriodEnd) {
        return { label: 'Cancellation Scheduled', tone: 'warn' as const }
      }
      if (initial.subscription?.status === 'past_due') {
        return { label: 'Payment Needs Attention', tone: 'danger' as const }
      }
      return { label: 'Pro Active', tone: 'accent' as const }
    }
    return { label: 'No Subscription', tone: 'muted' as const }
  })()

  const planIntro = isFeaturesTrial
    ? `Pro features are on for ${PRO_FEATURES_TRIAL_DAYS} days. Subscribe anytime for ${PRO_MONTHLY_CITES} Cites each month. We won't charge you when the trial ends.`
    : showTrialConvert
      ? `Your Pro features trial ended. Subscribe to keep Pro and get ${PRO_MONTHLY_CITES} Cites every month.`
      : isPro
        ? 'Your subscription and billing details live on Plan. Packs, refills, and your Cites live on the Cites page.'
        : initial.trial.phase === 'eligible'
          ? `Buy a Cites pack anytime. Your first top-up includes ${PRO_FEATURES_TRIAL_DAYS} days of Pro features. Or subscribe for a monthly allotment.`
          : 'Top up Cites anytime, or subscribe to Pro for a monthly allotment and extra features.'

  const planDetail = (() => {
    if (isFeaturesTrial) {
      return trialEnd
        ? `Trial ends ${trialEnd}. Pack Cites never expire, and the ${PRO_MONTHLY_CITES} monthly allotment starts when you subscribe.`
        : `Pack Cites never expire. The ${PRO_MONTHLY_CITES} monthly allotment starts when you subscribe.`
    }
    if (showTrialConvert) {
      return 'Nothing is charged unless you choose a plan.'
    }
    if (isPro) {
      if (initial.subscription?.cancelAtPeriodEnd && periodEnd) {
        return `Pro features stay on until ${periodEnd}.`
      }
      if (periodEnd) {
        const interval =
          initial.subscription?.billingInterval === 'year' ? 'Annual' : 'Monthly'
        return `Renews ${periodEnd} · ${interval}`
      }
      return 'Manage billing on Plan, or open Cites for packs and refills.'
    }
    if (initial.trial.phase === 'eligible') {
      return `Compare Plans when you are ready for ${PRO_MONTHLY_CITES} Cites each month.`
    }
    return 'Compare Plans when you are ready for Pro.'
  })()

  useEffect(() => {
    setPreference(theme)
  }, [theme, setPreference])

  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 2500)
    return () => clearTimeout(t)
  }, [message])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#plan') return
    document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved])

  useEffect(() => {
    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!cleaned) {
      setUsernameStatus({
        checking: false,
        available: false,
        reason: 'Username is required.',
      })
      return
    }
    if (cleaned === initial.username) {
      setUsernameStatus({ checking: false, available: true, reason: null })
      return
    }
    if (cleaned.length < 3) {
      setUsernameStatus({
        checking: false,
        available: false,
        reason: 'Use at least 3 lowercase characters.',
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
          setUsernameStatus({
            checking: false,
            available: null,
            reason: 'We couldn\u2019t check that username.',
          })
        }
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [username, initial.username])

  useEffect(() => {
    if (!prefsReady.current) {
      prefsReady.current = true
      return
    }
    const handle = setTimeout(async () => {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prefsOnly: true,
          defaultStyle,
          defaultInText,
          defaultSuggestCorrections,
          defaultRecency,
          defaultSourceTier,
          themePreference: theme,
        }),
      })
      if (res.ok) router.refresh()
    }, 400)
    return () => clearTimeout(handle)
  }, [
    defaultStyle,
    defaultInText,
    defaultSuggestCorrections,
    defaultRecency,
    defaultSourceTier,
    theme,
    router,
  ])

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!saveEnabled) return

    setBusy(true)
    setMessage(null)
    setSaved(false)

    if (profileDirty) {
      const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (cleaned.length < 3) {
        setMessage('Username must be at least 3 characters.')
        setBusy(false)
        return
      }
      if (usernameStatus.available === false) {
        setMessage(usernameStatus.reason ?? 'That username is already taken.')
        setBusy(false)
        return
      }

      if (initial.canChangePassword && password) {
        if (password.length < 6) {
          setMessage('Password must be at least 6 characters.')
          setBusy(false)
          return
        }
        if (password !== passwordConfirm) {
          setMessage('Passwords do not match.')
          setBusy(false)
          return
        }
        const supabase = createClient()
        const { error } = await supabase.auth.updateUser({ password })
        if (error) {
          setMessage(error.message)
          setBusy(false)
          return
        }
        setPassword('')
        setPasswordConfirm('')
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileOnly: true,
          username: cleaned,
          schoolId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? 'We couldn\u2019t save your changes.')
        setBusy(false)
        return
      }
      router.refresh()
    }

    setAcknowledgedPrefs(currentPrefs)
    setSaved(true)
    setBusy(false)
  }

  async function updateEmail() {
    const next = emailEdit.trim()
    if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
      setEmailMessage('Enter a valid email address.')
      return
    }
    if (next === initial.signInEmail) {
      setEmailMessage('That is already your email.')
      return
    }
    setEmailBusy(true)
    setEmailMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ email: next })
      if (error) {
        setEmailMessage(error.message)
        setEmailBusy(false)
        return
      }
      setEmailMessage('Check your inbox to confirm the new email address.')
      setEmailBusy(false)
    } catch (err) {
      setEmailMessage(err instanceof Error ? err.message : "We couldn't update your email.")
      setEmailBusy(false)
    }
  }

  async function resendVerification() {
    const target = emailEdit.trim() || initial.signInEmail
    if (!target || target === 'Not set') {
      setEmailMessage('Add an email address first.')
      return
    }
    setEmailBusy(true)
    setEmailMessage(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/')}`,
        },
      })
      if (error) {
        setEmailMessage(error.message)
        setEmailBusy(false)
        return
      }
      setEmailMessage('Confirmation email sent. Check your inbox.')
      setEmailBusy(false)
    } catch (err) {
      setEmailMessage(err instanceof Error ? err.message : "We couldn't resend that email.")
      setEmailBusy(false)
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    const res = await fetch('/api/settings/delete', { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setDeleting(false)
      setDeleteOpen(false)
      setMessage(data.error ?? 'We couldn\u2019t delete your account.')
      return
    }
    router.replace('/login')
  }

  return (
    <>
      <form className="settings-page" onSubmit={save}>
        <BackLink />
        <h1>Settings</h1>

        <section className="settings-panel">
          <h2>Profile</h2>
          <label>
            <span>Username</span>
            <input
              value={username}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={24}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            />
            {usernameStatus.checking ? (
              <span className="username-hint">Checking availability…</span>
            ) : null}
            {!usernameStatus.checking &&
            usernameStatus.available === true &&
            username &&
            username !== initial.username ? (
              <span className="username-hint is-ok">That username is available.</span>
            ) : null}
            {!usernameStatus.checking && usernameStatus.reason && usernameStatus.available === false ? (
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
          <label>
            <span>{initial.signInLabel}</span>
            {initial.canChangePassword ? (
              <>
                <input
                  type="email"
                  autoComplete="email"
                  value={emailEdit}
                  onChange={(e) => setEmailEdit(e.target.value)}
                />
                <div className="settings-email-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={emailBusy}
                    onClick={() => void updateEmail()}
                  >
                    {emailBusy ? 'Saving…' : 'Update Email'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={emailBusy}
                    onClick={() => void resendVerification()}
                  >
                    Resend Confirmation
                  </Button>
                </div>
                {emailMessage ? <span className="username-hint">{emailMessage}</span> : null}
              </>
            ) : (
              <div className="settings-readonly-field" aria-readonly="true">
                <span className="settings-readonly-field__email">{initial.signInEmail}</span>
                {initial.signInOAuthLabel ? (
                  <span className="settings-readonly-field__oauth">{initial.signInOAuthLabel}</span>
                ) : null}
              </div>
            )}
          </label>
          {initial.canChangePassword ? (
            <>
              <label>
                <span>New Password</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </label>
              {password ? (
                <label>
                  <span>Confirm Password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={passwordConfirm}
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {profileDirty ? (
            <p className="settings-unsaved">You have unsaved changes.</p>
          ) : null}
        </section>

        <section className="settings-panel settings-plan" id="plan">
          <div className="pg-title-copy">
            <h2>Plan</h2>
            <p className="pg-muted">{planIntro}</p>
          </div>

          <div className={`settings-plan__card ${isPro ? 'is-pro' : ''}`.trim()}>
            <div className="settings-plan__summary">
              <div className="settings-plan__stat">
                <span className="settings-plan__stat-label">Current Plan</span>
                <p
                  className={`settings-plan__stat-value ${isPro ? 'is-pro' : ''}`.trim()}
                >
                  {planTierLabel}
                </p>
                <span
                  className={`settings-plan__badge is-${planStatus.tone}`.trim()}
                >
                  {planStatus.label}
                </span>
              </div>
              <div className="settings-plan__stat">
                <span className="settings-plan__stat-label">Cites</span>
                <p className="settings-plan__stat-value">
                  {initial.citesBalance.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="settings-plan__actions">
              <Link
                href="/upgrade"
                className="pg-btn pg-btn--success pg-btn--sm settings-plan__action"
              >
                {upgradeLabel}
              </Link>
              <Link
                href="/cites"
                className="pg-btn pg-btn--success pg-btn--sm settings-plan__action"
              >
                Open Cites
              </Link>
            </div>

            <p className="settings-plan__detail">{planDetail}</p>
          </div>

          {isPro && !isFeaturesTrial && !initial.hasBillingAccount ? (
            <p className="settings-plan-hint">
              Billing details aren&apos;t linked yet. If this looks wrong,{' '}
              <Link href="/upgrade">open Plan</Link> or try again later.
            </p>
          ) : null}
        </section>

        <section className="settings-panel">
          <h2>Defaults</h2>
          <Select
            label="Referencing Style"
            value={defaultStyle}
            options={REFERENCING_STYLES.map((s) => ({
              value: s.id,
              label: s.label,
              locked: s.proOnly && !isPro,
              badge: s.proOnly && !isPro ? 'Pro' : undefined,
            }))}
            onChange={setDefaultStyle}
            onLockedSelect={(value) => {
              const style = REFERENCING_STYLES.find((s) => s.id === value)
              setUpsell({ feature: 'styles', detail: style?.label })
            }}
          />
          <Select
            label="In-Text Citations"
            value={defaultInText ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Enabled' },
              { value: 'off', label: 'Disabled' },
            ]}
            onChange={(v) => setDefaultInText(v === 'on')}
          />
          <Select
            label="Suggestions"
            value={defaultSuggestCorrections ? 'on' : 'off'}
            options={[
              {
                value: 'on',
                label: 'Enabled',
                locked: !suggestionsAvailable,
                badge: !suggestionsAvailable ? 'Pro' : undefined,
              },
              { value: 'off', label: 'Disabled' },
            ]}
            onChange={(v) => setDefaultSuggestCorrections(v === 'on')}
            onLockedSelect={() => setUpsell({ feature: 'suggestions' })}
          />
          {!suggestionsAvailable ? (
            <p className="settings-plan-hint">
              Want writing suggestions too? That comes with{' '}
              <button
                type="button"
                className="settings-plan-hint__link"
                onClick={() => setUpsell({ feature: 'suggestions' })}
              >
                Pro
              </button>
              .
            </p>
          ) : null}
          <Select
            label="Recency"
            value={defaultRecency}
            options={[
              { value: 'any', label: 'Any' },
              {
                value: '5y',
                label: '<5y',
                locked: !isPro,
                badge: !isPro ? 'Pro' : undefined,
              },
              {
                value: '10y',
                label: '<10y',
                locked: !isPro,
                badge: !isPro ? 'Pro' : undefined,
              },
            ]}
            onChange={(v) => setDefaultRecency(v as SourceRecency)}
            onLockedSelect={() => setUpsell({ feature: 'recency' })}
          />
          {!isPro ? (
            <p className="settings-plan-hint">
              Prefer recent sources only? Recency filters open with{' '}
              <button
                type="button"
                className="settings-plan-hint__link"
                onClick={() => setUpsell({ feature: 'recency' })}
              >
                Pro
              </button>
              .
            </p>
          ) : null}
          <Select
            label="Sources"
            value={defaultSourceTier}
            options={[
              { value: 'any', label: 'Academic & Web' },
              { value: 'academic', label: 'Academic Only' },
            ]}
            onChange={(v) => setDefaultSourceTier(v as SourceTier)}
          />
        </section>

        <section className="settings-panel">
          <h2>Appearance</h2>
          <Select
            label="Theme"
            value={theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => setTheme(v as ThemePreference)}
          />
        </section>

        <section className="settings-panel settings-danger">
          <div className="pg-title-copy settings-danger__copy">
            <h2>Delete Account</h2>
            <p className="pg-muted">
              This wipes your profile, your draft library, and your Cites for good. Once
              it&apos;s done, there&apos;s no bringing it back.
            </p>
          </div>
          <Button
            type="button"
            variant="danger"
            className="settings-btn-width"
            onClick={() => setDeleteOpen(true)}
          >
            Delete Account
          </Button>
        </section>

        <div className="settings-save">
          <Button
            type="submit"
            variant="accent"
            className="pg-btn--action"
            disabled={
              busy ||
              !saveEnabled ||
              (profileDirty &&
                (username.trim().length < 3 ||
                  usernameStatus.available === false ||
                  usernameStatus.checking))
            }
          >
            {busy ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
          </Button>
          {message ? <p className="settings-message">{message}</p> : null}
        </div>
      </form>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false)
        }}
        title="Delete Account?"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={deleteAccount}>
              {deleting ? 'Deleting…' : 'Delete Forever'}
            </Button>
          </>
        }
      >
        <p>
          This will permanently delete your Pergamum account along with your draft library and
          any remaining Cites. If you ever want to come back, you&apos;ll need to start fresh with
          a new account.
        </p>
      </Dialog>
      <ProUpsellDialog
        open={upsell != null}
        onClose={() => setUpsell(null)}
        feature={upsell?.feature ?? 'generic'}
        detail={upsell?.detail}
      />
    </>
  )
}
