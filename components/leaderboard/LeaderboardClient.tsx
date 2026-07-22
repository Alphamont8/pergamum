'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { LeaderboardScope, PlanTier } from '@/types'
import { normalizePlanTier, planDisplayName } from '@/lib/billing/plans'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import './leaderboard.css'

interface IndividualRow {
  user_id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  school_name: string | null
  plan_tier?: string | null
  sentences_checked: number
  bibliographies_generated: number
  cites_earned: number
}

interface SchoolRow {
  school_id: string
  school_name: string
  country: string | null
  sentences_checked: number
  bibliographies_generated: number
  cites_earned: number
  member_count: number
}

type MetricKey = 'sentences_checked' | 'bibliographies_generated' | 'cites_earned'

const METRICS: Array<{ key: MetricKey; label: string }> = [
  { key: 'sentences_checked', label: 'Sentences Checked' },
  { key: 'bibliographies_generated', label: 'Bibliographies Generated' },
  { key: 'cites_earned', label: 'Cites Gained' },
]

const SCOPE_LABELS: Record<LeaderboardScope, string> = {
  global: 'Worldwide',
  school: 'Schools',
  friends: 'Friends',
}

const TOP_N = 30

interface BoardRow {
  rank: number
  id: string
  name: string
  sub: string
  value: number
  isYou?: boolean
  planTier?: PlanTier
}

export function LeaderboardClient({
  currentUserId,
  referralCode,
  appUrl,
}: {
  currentUserId: string
  referralCode: string
  appUrl: string
}) {
  const [scope, setScope] = useState<LeaderboardScope>('global')
  const [individuals, setIndividuals] = useState<IndividualRow[]>([])
  const [schools, setSchools] = useState<SchoolRow[]>([])
  const [me, setMe] = useState<IndividualRow | null>(null)
  const [schoolName, setSchoolName] = useState<string | null>(null)
  const [mySchoolId, setMySchoolId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [friendCode, setFriendCode] = useState('')
  const [friendBusy, setFriendBusy] = useState(false)
  const [friendMessage, setFriendMessage] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState(false)

  const referralLink = `${appUrl}/login?ref=${referralCode}`

  const loadLeaderboard = useCallback(async (activeScope: LeaderboardScope) => {
    const res = await fetch(`/api/leaderboard?scope=${activeScope}`)
    if (!res.ok) return false
    const data = await res.json()
    setIndividuals(data.individuals ?? [])
    setSchools(data.schools ?? [])
    setMe(data.me ?? null)
    setSchoolName(data.schoolName ?? null)
    setMySchoolId(data.mySchoolId ?? null)
    return true
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      await loadLeaderboard(scope)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [loadLeaderboard, scope])

  useEffect(() => {
    if (!friendMessage) return
    const t = setTimeout(() => setFriendMessage(null), 3000)
    return () => clearTimeout(t)
  }, [friendMessage])

  async function addFriend(e: FormEvent) {
    e.preventDefault()
    setFriendBusy(true)
    setFriendMessage(null)
    try {
      const res = await fetch('/api/friends/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: friendCode.trim().toUpperCase() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'We couldn\u2019t add that friend.')
      setFriendMessage(data.message ?? 'Friend added!')
      setFriendCode('')
      if (scope === 'friends') await loadLeaderboard('friends')
    } catch (err) {
      setFriendMessage(err instanceof Error ? err.message : 'We couldn\u2019t add that friend.')
    } finally {
      setFriendBusy(false)
    }
  }

  const showSchoolIndividuals = scope !== 'school' || Boolean(mySchoolId)

  return (
    <div className="lb-page">
      <header className="lb-header">
        <BackLink href="/" />
        <div className="lb-header__row">
          <h1>Leaderboard</h1>
          <div className="lb-tabs" role="tablist">
            {(['global', 'school', 'friends'] as LeaderboardScope[]).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                className={scope === s ? 'is-active' : ''}
                onClick={() => setScope(s)}
              >
                {SCOPE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? <p className="pg-loading">Loading…</p> : null}

      {!loading ? (
        <>
          {showSchoolIndividuals ? (
            <section className="lb-section">
              {scope === 'school' ? <h2>{schoolName || 'Your School'}</h2> : null}
              {scope === 'friends' ? <h2>Friends</h2> : null}
              {scope === 'global' ? <h2>Worldwide</h2> : null}
              <div className="lb-grid">
                {METRICS.map((metric) => (
                  <Board
                    key={metric.key}
                    title={metric.label}
                    showPlan
                    rows={buildIndividualBoard(
                      individuals,
                      me,
                      metric.key,
                      currentUserId,
                      scope !== 'school',
                    )}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {scope === 'friends' ? (
            <section className="lb-section lb-friends-panel">
              <div className="pg-title-copy lb-friends-panel__intro">
                <h2>Add Friends</h2>
                <p className="pg-muted">
                  Share your code so friends show up here. The first friend code on a new account
                  unlocks 25 Cites each after they run a citation that uses Cites.
                </p>
              </div>
              <div className="lb-friends-panel__grid">
                <div className="lb-friends-panel__col">
                  <span className="lb-friends-panel__label">Your Code</span>
                  <div className="lb-referral-box">
                    <code>{referralCode}</code>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(referralLink).then(() => {
                          setCopiedLink(true)
                          window.setTimeout(() => setCopiedLink(false), 1800)
                        })
                      }}
                    >
                      {copiedLink ? 'Copied' : 'Copy Link'}
                    </Button>
                  </div>
                </div>
                <form className="lb-friends-panel__col lb-friend-form" onSubmit={addFriend}>
                  <span className="lb-friends-panel__label">Add a Friend</span>
                  <div className="lb-referral-box lb-friend-input-box">
                    <input
                      value={friendCode}
                      onChange={(e) =>
                        setFriendCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      }
                      maxLength={6}
                      placeholder="Enter their 6-letter code"
                      disabled={friendBusy}
                      aria-label="Friend code"
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={friendBusy || friendCode.length !== 6}
                    >
                      {friendBusy ? 'Adding…' : 'Add Friend'}
                    </Button>
                  </div>
                </form>
              </div>
              {friendMessage ? <p className="lb-friends-message">{friendMessage}</p> : null}
            </section>
          ) : null}

          {scope === 'school' ? (
            <section className="lb-section">
              <h2>Schools</h2>
              <div className="lb-grid">
                {METRICS.map((metric) => (
                  <Board
                    key={`school-${metric.key}`}
                    title={metric.label}
                    rows={buildSchoolBoard(schools, metric.key, mySchoolId)}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function individualSubtitle(schoolName: string | null | undefined, showSchool: boolean): string {
  if (!showSchool) return ''
  return schoolName?.trim() || 'Unaffiliated'
}

function buildIndividualBoard(
  individuals: IndividualRow[],
  me: IndividualRow | null,
  metric: MetricKey,
  currentUserId: string,
  showSchool: boolean,
): BoardRow[] {
  const sorted = [...individuals].sort((a, b) => Number(b[metric]) - Number(a[metric]))
  const top = sorted.slice(0, TOP_N).map((row, i) => ({
    rank: i + 1,
    id: row.user_id,
    name: row.username || row.display_name || 'Anonymous',
    sub: individualSubtitle(row.school_name, showSchool),
    value: Number(row[metric]),
    isYou: row.user_id === currentUserId,
    planTier: normalizePlanTier(row.plan_tier),
  }))

  const inTop = top.some((r) => r.id === currentUserId)
  if (inTop) return top

  const self =
    me ?? individuals.find((r) => r.user_id === currentUserId) ?? null
  if (!self) return top

  const idx = sorted.findIndex((r) => r.user_id === currentUserId)
  const fullRank = idx >= 0 ? idx + 1 : Math.max(TOP_N + 1, sorted.length + 1)

  return [
    ...top,
    {
      rank: fullRank,
      id: self.user_id,
      name: self.username || self.display_name || 'You',
      sub: individualSubtitle(self.school_name, showSchool),
      value: Number(self[metric]),
      isYou: true,
      planTier: normalizePlanTier(self.plan_tier),
    },
  ]
}

function buildSchoolBoard(
  schools: SchoolRow[],
  metric: MetricKey,
  mySchoolId: string | null,
): BoardRow[] {
  const sorted = [...schools].sort((a, b) => Number(b[metric]) - Number(a[metric]))
  const top = sorted.slice(0, TOP_N).map((row, i) => ({
    rank: i + 1,
    id: row.school_id,
    name: row.school_name,
    sub: simplifyCountry(row.country) || '\u00a0',
    value: Number(row[metric]),
    isYou: Boolean(mySchoolId && row.school_id === mySchoolId),
  }))

  if (!mySchoolId) return top
  if (top.some((r) => r.id === mySchoolId)) return top

  const self = sorted.find((r) => r.school_id === mySchoolId)
  if (!self) return top

  const idx = sorted.findIndex((r) => r.school_id === mySchoolId)
  return [
    ...top,
    {
      rank: idx + 1,
      id: self.school_id,
      name: self.school_name,
      sub: simplifyCountry(self.country) || '\u00a0',
      value: Number(self[metric]),
      isYou: true,
    },
  ]
}

function simplifyCountry(country: string | null): string | null {
  if (!country) return null
  return country.replace(/, Province of China$/i, '')
}

function Board({
  title,
  rows,
  showPlan = false,
}: {
  title: string
  rows: BoardRow[]
  showPlan?: boolean
}) {
  const youRow = useMemo(() => rows.find((r) => r.isYou) ?? null, [rows])
  const youBeyondTop = Boolean(youRow && youRow.rank > TOP_N)
  const visibleRows = youBeyondTop ? rows.filter((r) => !r.isYou) : rows

  return (
    <div className="lb-board">
      <h3>{title}</h3>
      <div className="lb-board__frame">
        <ol>
          {visibleRows.length === 0 ? <li className="pg-subtle">No data yet.</li> : null}
          {visibleRows.map((row) => (
            <li key={`${row.id}-${row.rank}`} className={row.isYou ? 'is-you' : undefined}>
              <span className="lb-rank">{row.rank}</span>
              <span className="lb-name">
                <span className="lb-name-row">
                  <strong>
                    <span className="lb-name-text">{row.name}</span>
                    {showPlan && row.planTier ? (
                      <span
                        className={`lb-plan-tag ${row.planTier === 'pro' ? 'is-pro' : 'is-basic'}`}
                      >
                        {planDisplayName(row.planTier)}
                      </span>
                    ) : null}
                  </strong>
                </span>
                {row.sub ? <span className="lb-sub pg-subtle">{row.sub}</span> : null}
              </span>
              <span className="lb-value">{row.value.toLocaleString()}</span>
            </li>
          ))}
        </ol>
        {youBeyondTop && youRow ? (
          <div className="lb-pinned">
            <span className="lb-rank">{youRow.rank}</span>
            <span className="lb-name">
              <span className="lb-name-row">
                <strong>
                  <span className="lb-name-text">{youRow.name}</span>
                  {showPlan && youRow.planTier ? (
                    <span
                      className={`lb-plan-tag ${youRow.planTier === 'pro' ? 'is-pro' : 'is-basic'}`}
                    >
                      {planDisplayName(youRow.planTier)}
                    </span>
                  ) : null}
                </strong>
              </span>
              {youRow.sub ? <span className="lb-sub pg-subtle">{youRow.sub}</span> : null}
            </span>
            <span className="lb-value">{youRow.value.toLocaleString()}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}
