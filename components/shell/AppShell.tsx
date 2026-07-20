'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu'
import { LibrarySidebar } from '@/components/shell/HistorySidebar'
import { LibraryProvider, useLibrary } from '@/components/shell/LibraryContext'
import { ProfileAvatar } from '@/components/shell/ProfileAvatar'
import type { ProTrialSnapshot } from '@/lib/billing/proTrial.shared'
import { PRO_MONTHLY_CITES } from '@/lib/billing/plans'
import { formatAppDate } from '@/lib/format/date'
import type { BillingInterval, PlanTier, SubscriptionStatus } from '@/types'
import './shell.css'

interface ShellProfile {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  citesBalance: number
  referralCode: string
  planTier: PlanTier
  hasBillingAccount: boolean
  trial: ProTrialSnapshot
  subscription: {
    status: SubscriptionStatus
    billingInterval: BillingInterval
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
  } | null
}

function isDraftRoute(pathname: string) {
  return pathname === '/' || pathname.startsWith('/c/')
}

function isEssayPage(pathname: string) {
  return pathname.startsWith('/c/')
}

function AppShellInner({
  profile,
  children,
}: {
  profile: ShellProfile
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { generations, sidebarOpen, openLibrary, closeLibrary, toggleLibrary, refreshGenerations } =
    useLibrary()
  const [balance, setBalance] = useState(profile.citesBalance)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const onDraftRoute = isDraftRoute(pathname)
  const isPro = profile.planTier === 'pro'
  const isFeaturesTrial = profile.trial.phase === 'active'
  const sub = profile.subscription
  const periodEnd = sub?.currentPeriodEnd ? formatAppDate(sub.currentPeriodEnd) : null
  const trialEnd = profile.trial.endsAt ? formatAppDate(profile.trial.endsAt) : null
  const trialDays = profile.trial.daysRemaining

  const billingBanner = !bannerDismissed
    ? isFeaturesTrial
      ? {
          tone: 'info' as const,
          text:
            trialDays != null && trialDays >= 0
              ? `Pro features trial · ${trialDays} day${trialDays === 1 ? '' : 's'} left${trialEnd ? ` (ends ${trialEnd})` : ''}. Pack Cites still work, and the ${PRO_MONTHLY_CITES} monthly allotment starts when you subscribe.`
              : `Pro features trial is active${trialEnd ? ` until ${trialEnd}` : ''}. Subscribe anytime for ${PRO_MONTHLY_CITES} Cites each month. We won't charge you when the trial ends.`,
          cta: 'Keep Pro',
          href: '/upgrade' as string | null,
        }
      : profile.trial.showConvertPrompt
        ? {
            tone: 'warn' as const,
            text: `Your Pro features trial ended. Subscribe to keep every Pro feature and get ${PRO_MONTHLY_CITES} Cites every month. Nothing is charged unless you subscribe.`,
            cta: 'Subscribe to Pro',
            href: '/upgrade' as string | null,
          }
        : isPro && sub
          ? sub.status === 'past_due'
            ? {
                tone: 'warn' as const,
                text: 'Your Pro payment needs attention. Update billing to keep Pro features.',
                cta: 'Manage Billing',
                href: null as string | null,
              }
            : sub.cancelAtPeriodEnd
              ? {
                  tone: 'info' as const,
                  text: periodEnd
                    ? `Pro cancellation is scheduled. You'll keep Pro until ${periodEnd}.`
                    : 'Pro cancellation is scheduled. You can reopen billing anytime.',
                  cta: 'Manage Plan',
                  href: null as string | null,
                }
              : null
          : null
    : null

  useEffect(() => {
    if (!onDraftRoute) {
      closeLibrary()
    }
  }, [onDraftRoute, closeLibrary])

  useEffect(() => {
    setBalance(profile.citesBalance)
  }, [profile.citesBalance])

  useEffect(() => {
    setBannerDismissed(false)
  }, [profile.trial.phase, profile.trial.showConvertPrompt, sub?.status, sub?.cancelAtPeriodEnd])

  useEffect(() => {
    if (!billingBanner) return
    const timer = window.setTimeout(() => setBannerDismissed(true), 12000)
    return () => window.clearTimeout(timer)
  }, [
    billingBanner?.text,
    billingBanner?.cta,
    billingBanner?.tone,
  ])

  useEffect(() => {
    const channel = supabase
      .channel(`profile-balance-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${profile.id}`,
        },
        (payload) => {
          const row = payload.new as {
            cites_balance?: number
            pro_cites_balance?: number
          }
          const permanent = Number(row.cites_balance ?? 0)
          const proPool = Number(row.pro_cites_balance ?? 0)
          if (Number.isFinite(permanent) && Number.isFinite(proPool)) {
            setBalance(permanent + proPool)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile.id, supabase])

  const handleLibraryClick = useCallback(() => {
    if (isEssayPage(pathname)) {
      toggleLibrary()
      return
    }

    if (pathname === '/' && sidebarOpen) {
      closeLibrary()
      return
    }

    openLibrary()
    const target = generations[0]?.id ? `/c/${generations[0].id}` : '/'
    router.push(target)
    void refreshGenerations()
  }, [
    closeLibrary,
    generations,
    openLibrary,
    pathname,
    refreshGenerations,
    router,
    sidebarOpen,
    toggleLibrary,
  ])

  const openBilling = useCallback(async () => {
    if (!profile.hasBillingAccount) {
      router.push('/upgrade')
      return
    }
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        router.push('/upgrade')
        return
      }
      window.location.assign(data.url)
    } catch {
      router.push('/upgrade')
    }
  }, [profile.hasBillingAccount, router])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }, [router, supabase])

  const initials = (profile.username ?? profile.displayName ?? 'P').slice(0, 1).toUpperCase()

  return (
    <div className={`app-shell ${sidebarOpen && onDraftRoute ? 'sidebar-open' : ''}`}>
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className={`topbar-word ${sidebarOpen && onDraftRoute ? 'is-active' : ''}`}
            aria-label="Open draft library"
            onClick={handleLibraryClick}
          >
            Library
          </button>
          <Link
            href="/leaderboard"
            className={`topbar-word ${pathname === '/leaderboard' ? 'is-active' : ''}`}
            prefetch
          >
            Leaderboard
          </Link>
        </div>
        <Link
          href="/"
          className="topbar-brand"
          aria-label="Pergamum home"
          prefetch
          onClick={() => closeLibrary()}
        >
          Pergamum
        </Link>
        <div className="topbar__right">
          {!isPro ? (
            <Link
              href="/upgrade"
              className={`topbar-word ${pathname === '/upgrade' ? 'is-active' : ''}`}
              prefetch
            >
              Upgrade
            </Link>
          ) : null}
          <Link
            href="/cites"
            className={`cites-chip ${pathname === '/cites' ? 'is-active' : ''}`}
            prefetch
          >
            <span>{balance.toLocaleString()}</span>
            <span className="cites-chip__label">Cites</span>
          </Link>
          <Menu>
            <MenuTrigger>
              <ProfileAvatar
                userId={profile.id}
                avatarUrl={profile.avatarUrl}
                initials={initials}
              />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => router.push('/settings')}>Settings</MenuItem>
              {isPro ? (
                <MenuItem onSelect={() => router.push('/upgrade')}>Plan</MenuItem>
              ) : null}
              <MenuItem onSelect={() => router.push('/help')}>Help</MenuItem>
              <MenuItem danger onSelect={signOut}>
                Sign Out
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      {billingBanner ? (
        <div
          className={`shell-billing-banner ${billingBanner.tone === 'warn' ? 'is-warn' : 'is-info'}`}
          role="status"
        >
          <p>{billingBanner.text}</p>
          <div className="shell-billing-banner__actions">
            <button
              type="button"
              onClick={() => {
                if (billingBanner.href) {
                  router.push(billingBanner.href)
                  return
                }
                void openBilling()
              }}
            >
              {billingBanner.cta}
            </button>
            <button
              type="button"
              className="shell-billing-banner__dismiss"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      <div className="app-body">
        <LibrarySidebar open={sidebarOpen && onDraftRoute} />
        <main className="app-main">{children}</main>
      </div>
    </div>
  )
}

export function AppShell({
  profile,
  children,
}: {
  profile: ShellProfile
  children: React.ReactNode
}) {
  return (
    <LibraryProvider>
      <AppShellInner profile={profile}>{children}</AppShellInner>
    </LibraryProvider>
  )
}
