'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { REFERENCING_STYLES, labelForStyle } from '@/utils/referencingStyle'
import { formatBibliographyForCopy, formatEssayForDisplay } from '@/lib/essay/format'
import type { LiveSentenceState } from '@/lib/essay/liveSegments'
import type { CitationPipelineStage } from '@/lib/cite/stages'
import { BASIC_MAX_WORDS } from '@/lib/billing/plans'
import { ProUpsellDialog } from '@/components/billing/ProUpsellDialog'
import type { ProUpsellFeature } from '@/lib/billing/proUpsell'
import { useProfileDefaults } from '@/components/shell/ProfileDefaults'
import { dispatchLibrarySync } from '@/lib/library/sync'
import {
  buildDefaultSettings,
  clearComposerDraft,
  COMPOSER_CLEAR_EVENT,
  loadComposerDraft,
  saveComposerDraft,
  settingsMatchDefaults,
} from '@/lib/composer/draft'
import type { GenerationSettings, SourceRecency, SourceTier } from '@/types'
import { GenerationTheater } from './GenerationTheater'
import type { ActivityLogEntry, BibChip, PossibleMatchChip } from './PipelineActivityRail'
import './chat.css'

interface AnalyzedSentence {
  index: number
  text: string
  reason?: string
  claimType?: 'academic' | 'news' | 'mixed'
}

interface CitationEvent {
  sentenceIndex: number
  sentence: string
  status: 'done' | 'failed'
  inText?: string
  correction?: string | null
  bibliography?: string
  title?: string
  errorMessage?: string
  current: number
  total: number
}

interface ResultPayload {
  essay: string
  originalEssay: string
  bibliography: string[]
  citations: Array<{
    index: number
    sentence: string
    status: string
    inText?: string
    correction?: string | null
    bibliography?: string
    title?: string
    authors?: string
    url?: string
    doi?: string
    errorMessage?: string
  }>
}

type Phase = 'idle' | 'analyzing' | 'quoted' | 'generating' | 'theater_done' | 'done' | 'error'

const PIPELINE_STAGES = new Set<string>([
  'claim',
  'resolve',
  'reuse',
  'academic',
  'web',
  'rank',
  'verify',
  'found',
  'miss',
  'searching',
])

const RECENCY_CYCLE: Array<{ value: SourceRecency; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: '5y', label: '<5y' },
  { value: '10y', label: '<10y' },
]

function ChatCollapse({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string
  meta?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="chat-collapse" open={defaultOpen}>
      <summary className="chat-collapse__summary">
        <span className="chat-collapse__chevron" aria-hidden />
        <span className="chat-collapse__title">{title}</span>
        {meta ? <span className="chat-collapse__meta">{meta}</span> : null}
      </summary>
      <div className="chat-collapse__body">{children}</div>
    </details>
  )
}

function PrefToggle({
  label,
  value,
  onClick,
  disabled,
  off,
  locked,
}: {
  label: string
  value: string
  onClick: () => void
  disabled?: boolean
  off?: boolean
  locked?: boolean
}) {
  return (
    <button
      type="button"
      className={`pref-chip ${locked ? 'pref-chip--locked' : ''}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="pref-chip__label">{label}</span>
      <span className="pref-chip__value-group">
        <span className={`pref-chip__value ${off ? 'is-off' : ''}`}>{value}</span>
        {locked ? <span className="pref-chip__pro">Pro</span> : null}
      </span>
    </button>
  )
}

export function CitationChat() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    userId,
    defaultStyle,
    defaultInText,
    defaultSuggestCorrections,
    defaultRecency,
    defaultSourceTier,
    planTier,
  } = useProfileDefaults()
  const isPro = planTier === 'pro'
  const suggestionsAvailable = isPro
  const [upsell, setUpsell] = useState<{ feature: ProUpsellFeature; detail?: string } | null>(
    null,
  )
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null)
  const draftDefaults = useMemo(
    () => ({
      defaultStyle,
      defaultInText,
      defaultSuggestCorrections,
      defaultRecency,
      defaultSourceTier,
    }),
    [
      defaultStyle,
      defaultInText,
      defaultSuggestCorrections,
      defaultRecency,
      defaultSourceTier,
    ],
  )
  const makeDefaultSettings = useCallback(
    () => buildDefaultSettings(draftDefaults, suggestionsAvailable),
    [draftDefaults, suggestionsAvailable],
  )
  const [essay, setEssay] = useState('')
  const [settings, setSettings] = useState<GenerationSettings>(makeDefaultSettings)
  const [phase, setPhase] = useState<Phase>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [sentences, setSentences] = useState<AnalyzedSentence[]>([])
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [citesRequired, setCitesRequired] = useState(0)
  const [balance, setBalance] = useState(0)
  const [enough, setEnough] = useState(true)
  const [liveCitations, setLiveCitations] = useState<CitationEvent[]>([])
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [acceptedCorrections, setAcceptedCorrections] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'essay' | 'bibliography' | null>(null)
  const [styleRailCollapsed, setStyleRailCollapsed] = useState(false)
  const [styleRailOpen, setStyleRailOpen] = useState(false)
  const [theaterLive, setTheaterLive] = useState<Record<number, LiveSentenceState>>({})
  const [activeIndexes, setActiveIndexes] = useState<number[]>([])
  const [sentenceStages, setSentenceStages] = useState<
    Record<number, CitationPipelineStage | 'searching'>
  >({})
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [liveBibliography, setLiveBibliography] = useState<BibChip[]>([])
  const [possibleMatches, setPossibleMatches] = useState<Record<number, PossibleMatchChip[]>>(
    {},
  )
  const [theaterStartedAt, setTheaterStartedAt] = useState(() => Date.now())
  const [analysisReasoning, setAnalysisReasoning] = useState<string | null>(null)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [draftTitle, setDraftTitle] = useState<string | null>(null)
  const logSeqRef = useRef(0)
  const streamRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prefsRef = useRef<HTMLDivElement>(null)
  const styleSlotRef = useRef<HTMLDivElement>(null)
  const styleChipRef = useRef<HTMLButtonElement>(null)
  const styleRailHostRef = useRef<HTMLDivElement>(null)
  const prefsRightRef = useRef<HTMLDivElement>(null)
  const styleRailRef = useRef<HTMLDivElement>(null)
  const styleRailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftHydratedRef = useRef(false)
  const lastAnalyzeKeyRef = useRef<string | null>(null)
  const resumeHandledRef = useRef<string | null>(null)
  const pendingGenerateRef = useRef(false)

  const analyzeCacheKey = useCallback(
    (essayText: string, s: GenerationSettings) =>
      JSON.stringify({
        essay: essayText,
        recency: s.recency,
        sourceTier: s.sourceTier,
      }),
    [],
  )

  const resetComposer = useCallback(() => {
    clearComposerDraft(userId)
    setEssay('')
    setSettings(makeDefaultSettings())
    setPhase('idle')
    setStatusMessage('')
    setProgress({ current: 0, total: 0 })
    setSentences([])
    setGenerationId(null)
    setCitesRequired(0)
    setBalance(0)
    setEnough(true)
    setLiveCitations([])
    setResult(null)
    setAcceptedCorrections({})
    setError(null)
    setCopied(null)
    setStyleRailCollapsed(false)
    setStyleRailOpen(false)
    setTheaterLive({})
    setActiveIndexes([])
    setSentenceStages({})
    setActivityLog([])
    setLiveBibliography([])
    setPossibleMatches({})
    setAnalysisReasoning(null)
    setReasoningOpen(false)
    setAnalysisStatus('')
    setDraftTitle(null)
    lastAnalyzeKeyRef.current = null
  }, [makeDefaultSettings, userId])

  const wordCount = useMemo(() => {
    const t = essay.trim()
    if (!t) return 0
    return t.split(/\s+/).filter(Boolean).length
  }, [essay])

  const overWordLimit = !isPro && wordCount > BASIC_MAX_WORDS

  const canAnalyze =
    essay.trim().length >= 40 &&
    phase !== 'analyzing' &&
    phase !== 'generating' &&
    phase !== 'theater_done' &&
    !overWordLimit
  const busy = phase === 'analyzing' || phase === 'generating'

  const styleLabel = labelForStyle(settings.styleId)

  const styleRailRevealed = styleRailOpen && !styleRailCollapsed

  const recencyLabel =
    RECENCY_CYCLE.find((r) => r.value === settings.recency)?.label ?? 'Any'

  useEffect(() => {
    const el = streamRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [phase, liveCitations.length, statusMessage, result, sentences.length])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const minHeight = 151
    const maxHeight = 227
    const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [essay, phase])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      if (styleRailCloseTimerRef.current) clearTimeout(styleRailCloseTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!userId) {
      draftHydratedRef.current = true
      return
    }
    const draft = loadComposerDraft(userId)
    if (draft) {
      setEssay(draft.essay)
      setSettings({
        ...draft.settings,
        suggestCorrections: suggestionsAvailable && draft.settings.suggestCorrections,
      })
    }
    draftHydratedRef.current = true
  }, [suggestionsAvailable, userId])

  useEffect(() => {
    const resumeId = searchParams.get('resume')
    const theaterId = searchParams.get('theater')
    const targetId = resumeId || theaterId
    if (!targetId || !userId) return
    if (resumeHandledRef.current === targetId) return
    resumeHandledRef.current = targetId

    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/generations/${targetId}`, { cache: 'no-store' })
        if (!res.ok) {
          if (res.status === 401) {
            router.replace(`/login?redirect=${encodeURIComponent('/')}&error=session`)
            return
          }
          setError("We couldn't reopen that draft.")
          setPhase('error')
          return
        }
        const data = (await res.json()) as {
          generation: {
            id: string
            title?: string | null
            essay_input: string
            status: string
            cites_required: number
            sentences?: AnalyzedSentence[] | null
            settings?: GenerationSettings | null
            error_message?: string | null
          }
        }
        if (cancelled) return

        const gen = data.generation
        const loadedSentences = Array.isArray(gen.sentences) ? gen.sentences : []
        setEssay(gen.essay_input || '')
        if (gen.settings && typeof gen.settings === 'object') {
          setSettings({
            styleId: gen.settings.styleId ?? settings.styleId,
            inText: gen.settings.inText ?? settings.inText,
            suggestCorrections:
              suggestionsAvailable && Boolean(gen.settings.suggestCorrections),
            recency: gen.settings.recency ?? settings.recency,
            sourceTier: gen.settings.sourceTier ?? settings.sourceTier,
          })
        }
        setGenerationId(gen.id)
        setSentences(loadedSentences)
        if (typeof gen.title === 'string' && gen.title.trim()) {
          setDraftTitle(gen.title.trim())
        }
        setCitesRequired(Number(gen.cites_required ?? loadedSentences.length))
        setEnough(true)
        setError(null)
        setResult(null)
        setLiveCitations([])

        if (theaterId && (gen.status === 'generating' || gen.status === 'quoted')) {
          setPhase('quoted')
          const msg = `Resuming generation for ${Number(gen.cites_required ?? loadedSentences.length)} sentence${
            Number(gen.cites_required ?? loadedSentences.length) === 1 ? '' : 's'
          }…`
          setStatusMessage(msg)
          setAnalysisStatus(
            `Found ${Number(gen.cites_required ?? loadedSentences.length)} sentence${
              Number(gen.cites_required ?? loadedSentences.length) === 1 ? '' : 's'
            } that need a source`,
          )
          pendingGenerateRef.current = true
        } else if (gen.status === 'quoted' || gen.status === 'analyzing') {
          setPhase('quoted')
          const msg =
            Number(gen.cites_required ?? 0) === 0
              ? 'Nothing here needs a citation. Your draft looks good to go.'
              : `Found ${gen.cites_required} sentence${gen.cites_required === 1 ? '' : 's'} that need a source · ${gen.cites_required} Cites required`
          setStatusMessage(msg)
          setAnalysisStatus(msg)
        } else if (gen.status === 'failed') {
          setPhase('error')
          setError(gen.error_message || "That draft didn't finish. You can try analyzing again.")
        } else if (gen.status === 'completed') {
          router.replace(`/c/${gen.id}`)
          return
        }

        router.replace('/', { scroll: false })
      } catch {
        if (!cancelled) {
          setPhase('error')
          setError("We couldn't reopen that draft.")
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router, searchParams, suggestionsAvailable, userId])

  useEffect(() => {
    if (!userId || !draftHydratedRef.current || phase !== 'idle') return
    if (!essay.trim() && settingsMatchDefaults(settings, draftDefaults, suggestionsAvailable)) {
      clearComposerDraft(userId)
      return
    }
    saveComposerDraft(userId, { essay, settings })
  }, [draftDefaults, essay, phase, settings, suggestionsAvailable, userId])

  useEffect(() => {
    const onClear = () => resetComposer()
    window.addEventListener(COMPOSER_CLEAR_EVENT, onClear)
    return () => window.removeEventListener(COMPOSER_CLEAR_EVENT, onClear)
  }, [resetComposer])

  const openStyleRail = useCallback(() => {
    if (styleRailCloseTimerRef.current) clearTimeout(styleRailCloseTimerRef.current)
    setStyleRailCollapsed(false)
    setStyleRailOpen(true)
  }, [])

  const scheduleCloseStyleRail = useCallback(() => {
    if (styleRailCloseTimerRef.current) clearTimeout(styleRailCloseTimerRef.current)
    styleRailCloseTimerRef.current = setTimeout(() => setStyleRailOpen(false), 100)
  }, [])

  useEffect(() => {
    const prefs = prefsRef.current
    const styleSlot = styleSlotRef.current
    const styleChip = styleChipRef.current
    const styleRailHost = styleRailHostRef.current
    const prefsRight = prefsRightRef.current
    if (!prefs || !styleChip || !styleRailHost || !prefsRight) return

    const syncRailBounds = () => {
      const prefsRect = prefs.getBoundingClientRect()
      const chipRect = styleChip.getBoundingClientRect()
      const startGap = 10
      const railLeft = chipRect.right - prefsRect.left + startGap
      styleRailHost.style.left = `${railLeft}px`
    }

    syncRailBounds()
    const ro = new ResizeObserver(syncRailBounds)
    ro.observe(prefs)
    ro.observe(styleChip)
    if (styleSlot) ro.observe(styleSlot)
    ro.observe(styleRailHost)
    ro.observe(prefsRight)
    window.addEventListener('resize', syncRailBounds)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncRailBounds)
    }
  }, [styleLabel, settings.styleId, styleRailCollapsed, styleRailOpen])

  const analyze = useCallback(async () => {
    clearComposerDraft(userId)
    const cacheKey = analyzeCacheKey(essay, settings)

    // Client-side short-circuit: unchanged essay + search settings.
    if (
      lastAnalyzeKeyRef.current === cacheKey &&
      generationId &&
      sentences.length > 0 &&
      phase === 'quoted'
    ) {
      setStatusMessage(
        citesRequired === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${citesRequired} sentence${citesRequired === 1 ? '' : 's'} that need a source · ${citesRequired} Cites required`,
      )
      setAnalysisStatus(
        citesRequired === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${citesRequired} sentence${citesRequired === 1 ? '' : 's'} that need a source · ${citesRequired} Cites required`,
      )
      return
    }

    setPhase('analyzing')
    setError(null)
    setDraftTitle(null)
    setResult(null)
    setLiveCitations([])
    setAnalysisReasoning(null)
    setReasoningOpen(true)
    setTheaterLive({})
    setActiveIndexes([])
    setSentenceStages({})
    setActivityLog([])
    setLiveBibliography([])
    setPossibleMatches({})
    setStatusMessage('Analyzing your draft for claims that need a source…')
    setAnalysisStatus('Analyzing your draft for claims that need a source…')
    try {
      const res = await fetch('/api/cite/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ essay, settings }),
      })
      if (res.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent('/')}&error=session`)
        return
      }
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'word_limit') {
          setUpsell({ feature: 'words', detail: BASIC_MAX_WORDS.toLocaleString() })
          setPhase('idle')
          setStatusMessage('')
          return
        }
        throw new Error(data.error ?? 'We couldn\u2019t analyze your draft.')
      }
      setGenerationId(data.generationId)
      setSentences(data.sentences)
      setCitesRequired(data.citesRequired)
      setBalance(data.balance)
      setEnough(data.enough)
      if (typeof data.title === 'string' && data.title.trim()) {
        setDraftTitle(data.title.trim())
        if (data.generationId) {
          dispatchLibrarySync({
            action: 'title',
            id: data.generationId,
            title: data.title.trim(),
          })
        }
      }
      const reasoning =
        typeof data.reasoning === 'string' && data.reasoning.trim()
          ? data.reasoning.trim()
          : Array.isArray(data.sentences)
            ? (data.sentences as AnalyzedSentence[])
                .map((s) => s.reason?.trim())
                .filter(Boolean)
                .join('\n\n')
            : ''
      setAnalysisReasoning(reasoning || null)
      setReasoningOpen(Boolean(reasoning))
      lastAnalyzeKeyRef.current = cacheKey
      setPhase('quoted')
      setStatusMessage(
        data.citesRequired === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${data.citesRequired} sentence${data.citesRequired === 1 ? '' : 's'} that need a source · ${data.citesRequired} Cites required`,
      )
      setAnalysisStatus(
        data.citesRequired === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${data.citesRequired} sentence${data.citesRequired === 1 ? '' : 's'} that need a source · ${data.citesRequired} Cites required`,
      )
      if (data.citesRequired === 0) {
        dispatchLibrarySync({ action: 'refresh' })
      }
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'We couldn\u2019t analyze your draft.')
    }
  }, [
    analyzeCacheKey,
    citesRequired,
    essay,
    generationId,
    phase,
    router,
    sentences.length,
    settings,
    userId,
  ])

  const generate = useCallback(async () => {
    if (!generationId) return

    if (!draftTitle || draftTitle === 'Untitled draft' || draftTitle === 'Untitled') {
      try {
        const titleRes = await fetch(`/api/generations/${generationId}`, { cache: 'no-store' })
        if (titleRes.ok) {
          const data = (await titleRes.json()) as { generation?: { title?: string | null } }
          const nextTitle = data.generation?.title?.trim()
          if (nextTitle && nextTitle !== 'Untitled draft' && nextTitle !== 'Untitled') {
            setDraftTitle(nextTitle)
          }
        }
      } catch {
        /* theater falls back to essay excerpt */
      }
    }

    setPhase('generating')
    setError(null)
    setLiveCitations([])
    setResult(null)
    setProgress({ current: 0, total: citesRequired || sentences.length })
    setStatusMessage('Searching for sources to back up your claims…')
    setTheaterStartedAt(Date.now())
    setActiveIndexes([])
    setSentenceStages({})
    setActivityLog([])
    setLiveBibliography([])
    setPossibleMatches({})
    logSeqRef.current = 0

    const initialLive: Record<number, LiveSentenceState> = {}
    for (const s of sentences) {
      initialLive[s.index] = { status: 'pending', sentence: s.text }
    }
    setTheaterLive(initialLive)

    const pushLog = (message: string, stage: ActivityLogEntry['stage'], sentenceIndex?: number) => {
      logSeqRef.current += 1
      const entry: ActivityLogEntry = {
        id: `${logSeqRef.current}-${Date.now()}`,
        message,
        stage,
        sentenceIndex,
        at: Date.now(),
      }
      setActivityLog((prev) => [entry, ...prev].slice(0, 40))
    }

    pushLog(
      `Working through ${sentences.length} sentence${sentences.length === 1 ? '' : 's'} at once…`,
      'searching',
    )

    try {
      const res = await fetch('/api/cite/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Citation generation didn\u2019t finish.')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''

        for (const chunk of chunks) {
          const lines = chunk.split('\n')
          let event = 'message'
          let dataLine = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            if (line.startsWith('data:')) dataLine = line.slice(5).trim()
          }
          if (!dataLine) continue
          const data = JSON.parse(dataLine) as Record<string, unknown>

          if (event === 'status') {
            setStatusMessage(String(data.message ?? ''))
            if (typeof data.current === 'number' && typeof data.total === 'number') {
              setProgress({ current: data.current, total: data.total })
            }
            if (typeof data.message === 'string') {
              pushLog(data.message, 'searching')
            }
          }

          if (event === 'progress') {
            const sentenceIndex =
              typeof data.sentenceIndex === 'number' ? data.sentenceIndex : undefined
            const stepRaw = typeof data.step === 'string' ? data.step : 'searching'
            const step = (PIPELINE_STAGES.has(stepRaw) ? stepRaw : 'searching') as
              | CitationPipelineStage
              | 'searching'
            const message =
              typeof data.message === 'string' ? data.message : 'Working on your draft…'

            setStatusMessage(message)
            if (typeof data.current === 'number' && typeof data.total === 'number') {
              setProgress((p) => ({
                current: data.current as number,
                total: (data.total as number) || p.total,
              }))
            }

            if (sentenceIndex != null) {
              setActiveIndexes((prev) =>
                prev.includes(sentenceIndex) ? prev : [...prev, sentenceIndex],
              )
              setSentenceStages((prev) => ({ ...prev, [sentenceIndex]: step }))
              setTheaterLive((prev) => {
                const cur = prev[sentenceIndex]
                if (!cur || cur.status === 'done' || cur.status === 'failed') return prev
                return {
                  ...prev,
                  [sentenceIndex]: { ...cur, status: 'active' },
                }
              })
            }

            if (step !== 'found' && step !== 'miss') {
              pushLog(message, step, sentenceIndex)
            }
          }

          if (event === 'title' && typeof data.title === 'string') {
            setDraftTitle(data.title)
            dispatchLibrarySync({
              action: 'title',
              id: generationId,
              title: data.title,
            })
          }
          if (event === 'refund' && typeof data.citesRefunded === 'number') {
            const refunded = data.citesRefunded
            setBalance((b) => b + refunded)
          }
          if (event === 'citation') {
            const sentenceIndex = data.sentenceIndex as number
            const status = data.status === 'done' ? 'done' : 'failed'
            const inText = typeof data.inText === 'string' ? data.inText : undefined
            const record = data.record as { title?: string } | undefined
            const title =
              (typeof data.title === 'string' && data.title) ||
              record?.title ||
              (status === 'done' ? 'Source found' : 'No solid match')

            setLiveCitations((prev) => [
              ...prev.filter((c) => c.sentenceIndex !== sentenceIndex),
              data as unknown as CitationEvent,
            ])
            if (typeof data.current === 'number' && typeof data.total === 'number') {
              setProgress({ current: data.current, total: data.total })
            }

            setActiveIndexes((prev) => prev.filter((i) => i !== sentenceIndex))
            setSentenceStages((prev) => {
              const next = { ...prev }
              delete next[sentenceIndex]
              return next
            })
            setTheaterLive((prev) => ({
              ...prev,
              [sentenceIndex]: {
                status,
                sentence: String(data.sentence ?? prev[sentenceIndex]?.sentence ?? ''),
                inText: status === 'done' ? inText : undefined,
              },
            }))
            if (status === 'failed' && Array.isArray(data.possibleMatches)) {
              const matches = (data.possibleMatches as PossibleMatchChip[])
                .filter((m) => m && typeof m.title === 'string')
                .slice(0, 3)
              setPossibleMatches((prev) => ({ ...prev, [sentenceIndex]: matches }))
            }
            setLiveBibliography((prev) => [
              ...prev.filter((b) => b.sentenceIndex !== sentenceIndex),
              {
                sentenceIndex,
                title,
                status,
                bibliography:
                  typeof data.bibliography === 'string' ? data.bibliography : undefined,
              },
            ])
            pushLog(
              status === 'done'
                ? `Cited sentence ${sentenceIndex + 1} · ${title}`
                : `Missed sentence ${sentenceIndex + 1}.`,
              status === 'done' ? 'found' : 'miss',
              sentenceIndex,
            )
          }
          if (event === 'complete') {
            const payload = data.result as ResultPayload & { citesRefunded?: number }
            if (typeof data.title === 'string' && data.title.trim()) {
              setDraftTitle(data.title.trim())
              dispatchLibrarySync({
                action: 'title',
                id: generationId,
                title: data.title.trim(),
              })
            }
            setResult(payload)
            setPhase('theater_done')
            setActiveIndexes([])
            const refunded = payload.citesRefunded ?? 0
            setStatusMessage(
              refunded > 0
                ? `All done! Your citations are ready. We refunded ${refunded} Cite${refunded === 1 ? '' : 's'} for sentences we couldn't source.`
                : 'All done! Your citations are ready.',
            )
            // Prefer final essay + citations from complete payload for the canvas.
            if (payload.originalEssay || payload.essay) {
              const finalLive: Record<number, LiveSentenceState> = {}
              for (const c of payload.citations) {
                finalLive[c.index] = {
                  status: c.status === 'done' ? 'done' : 'failed',
                  sentence: c.sentence,
                  inText: c.inText,
                }
              }
              setTheaterLive(finalLive)
            }
            dispatchLibrarySync({ action: 'refresh' })
          }
          if (event === 'error') {
            throw new Error(
              typeof data.message === 'string' ? data.message : 'Citation generation didn\u2019t finish.',
            )
          }
        }
      }
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Citation generation didn\u2019t finish.')
    }
  }, [draftTitle, generationId, citesRequired, sentences])

  useEffect(() => {
    if (!pendingGenerateRef.current) return
    if (!generationId || sentences.length === 0 || phase !== 'quoted') return
    pendingGenerateRef.current = false
    void generate()
  }, [generate, generationId, phase, sentences.length])

  const displayEssay = useMemo(() => {
    if (!result) return ''
    let text = result.essay
    for (const c of result.citations) {
      if (!c.correction || !acceptedCorrections[c.index]) continue
      if (text.includes(c.sentence)) {
        text = text.replace(c.sentence, c.correction)
      }
    }
    return text
  }, [result, acceptedCorrections])

  const copyText = useCallback(async (kind: 'essay' | 'bibliography', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(null), 1800)
  }, [])

  const cycleRecency = useCallback(() => {
    if (!isPro) {
      setUpsell({ feature: 'recency' })
      return
    }
    setSettings((s) => {
      const idx = RECENCY_CYCLE.findIndex((r) => r.value === s.recency)
      const next = RECENCY_CYCLE[(idx + 1) % RECENCY_CYCLE.length]
      return { ...s, recency: next.value }
    })
  }, [isPro])

  const correctionCount = result?.citations.filter((c) => c.correction).length ?? 0

  const showTheater =
    phase === 'generating' ||
    phase === 'theater_done' ||
    (phase === 'error' && Object.keys(theaterLive).length > 0)
  const showWorkspace = phase !== 'idle'
  const showComposer = phase === 'idle'

  const theaterEssay = result?.originalEssay || essay

  const onViewDraft = useCallback(() => {
    if (!generationId) return
    clearComposerDraft(userId)
    dispatchLibrarySync({ action: 'refresh' })
    router.push(`/c/${generationId}`)
  }, [generationId, router, userId])

  const onTheaterRetry = useCallback(() => {
    setError(null)
    setPhase('quoted')
    setTheaterLive({})
    setActiveIndexes([])
    setSentenceStages({})
    setActivityLog([])
    setLiveBibliography([])
    setPossibleMatches({})
  }, [])

  const retrySentence = useCallback(
    async (sentenceIndex: number) => {
      if (!generationId) return
      if (!isPro) {
        setUpsell({ feature: 'retry' })
        return
      }
      setRetryingIndex(sentenceIndex)
      setActiveIndexes((prev) =>
        prev.includes(sentenceIndex) ? prev : [...prev, sentenceIndex],
      )
      setSentenceStages((prev) => ({ ...prev, [sentenceIndex]: 'claim' }))
      setTheaterLive((prev) => ({
        ...prev,
        [sentenceIndex]: {
          status: 'active',
          sentence: prev[sentenceIndex]?.sentence ?? sentences.find((s) => s.index === sentenceIndex)?.text ?? '',
          inText: undefined,
        },
      }))
      try {
        const res = await fetch('/api/cite/retry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId, sentenceIndex }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (data.code === 'pro_required') {
            setUpsell({ feature: 'retry' })
            return
          }
          throw new Error(
            typeof data.error === 'string' ? data.error : "That retry didn't finish.",
          )
        }
        if (typeof data.balance === 'number') setBalance(data.balance)
        const citation = data.citation as {
          index: number
          sentence: string
          status: 'done' | 'failed'
          inText?: string
          title?: string
          bibliography?: string
          errorMessage?: string
        }
        setTheaterLive((prev) => ({
          ...prev,
          [sentenceIndex]: {
            status: citation.status === 'done' ? 'done' : 'failed',
            sentence: citation.sentence,
            inText: citation.inText,
          },
        }))
        setLiveBibliography((prev) => [
          ...prev.filter((b) => b.sentenceIndex !== sentenceIndex),
          {
            sentenceIndex,
            title:
              citation.title ||
              (citation.status === 'done' ? 'Source found' : 'No solid match'),
            status: citation.status === 'done' ? 'done' : 'failed',
            bibliography: citation.bibliography,
          },
        ])
        if (data.result) setResult(data.result as ResultPayload)
        setProgress((p) => ({
          ...p,
          current: Math.min(
            p.total,
            Object.values({
              ...theaterLive,
              [sentenceIndex]: { status: citation.status },
            }).filter((v) => v.status === 'done' || v.status === 'failed').length || p.current,
          ),
        }))
        dispatchLibrarySync({ action: 'refresh' })
      } catch (err) {
        setError(err instanceof Error ? err.message : "That retry didn't finish.")
      } finally {
        setActiveIndexes((prev) => prev.filter((i) => i !== sentenceIndex))
        setSentenceStages((prev) => {
          const next = { ...prev }
          delete next[sentenceIndex]
          return next
        })
        setRetryingIndex(null)
      }
    },
    [generationId, isPro, sentences, theaterLive],
  )

  const analysisStatusLabel =
    phase === 'analyzing'
      ? analysisStatus || 'Analyzing your draft…'
      : analysisStatus || statusMessage || 'Analysis ready'

  return (
    <div className={`chat-page ${showWorkspace ? 'chat-page--workspace' : ''}`.trim()}>
      <div className="chat-column">
        {showComposer ? (
          <div className="chat-empty">
            <h1>Cite Your Draft</h1>
            <p className="chat-empty__tagline">
              Paste your draft below and we&apos;ll handle the rest.
            </p>
          </div>
        ) : null}

        {showWorkspace ? (
          <div className="analysis-workspace" ref={streamRef}>
            <section className="analysis-essay" aria-label="Your draft">
              <div className="analysis-essay__head">
                <span className="analysis-essay__label">Your Draft</span>
                <span className="analysis-essay__meta pg-subtle">
                  {essay.trim().length.toLocaleString()} Characters · {styleLabel}
                </span>
              </div>
              <pre className="analysis-essay__body">{essay.trim()}</pre>
            </section>

            <section className="analysis-panel" aria-label="Draft analysis">
              <details
                className={`analysis-status ${phase === 'analyzing' ? 'is-busy' : ''}`.trim()}
                open={reasoningOpen}
                onToggle={(e) => setReasoningOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="analysis-status__summary">
                  {phase === 'analyzing' ? <span className="status-dot" /> : null}
                  <span className="analysis-status__title">{analysisStatusLabel}</span>
                  {analysisReasoning || phase === 'analyzing' ? (
                    <span className="analysis-status__hint pg-subtle">
                      {phase === 'analyzing' ? 'Working…' : 'Show Reasoning'}
                    </span>
                  ) : null}
                </summary>
                <div className="analysis-status__body">
                  {phase === 'analyzing' && !analysisReasoning ? (
                    <p className="pg-muted">
                      Isolating transferable claims, skipping plans and opinions, and building
                      search queries without essay-only brand names.
                    </p>
                  ) : null}
                  {analysisReasoning ? (
                    <pre className="analysis-status__reasoning">{analysisReasoning}</pre>
                  ) : phase !== 'analyzing' ? (
                    <p className="pg-muted">No detailed reasoning was returned for this run.</p>
                  ) : null}
                </div>
              </details>

              {phase === 'quoted' ? (
                <div className="analysis-results">
                  <div className="quote-meta">
                    <span className="quote-chip">
                      {citesRequired} sentence{citesRequired === 1 ? '' : 's'}
                    </span>
                    <span className="quote-chip">{citesRequired} Cites required</span>
                    <span className="quote-chip">{balance} Cites</span>
                  </div>

                  {!enough ? (
                    <div className="topup-prompt">
                      <p>
                        You&apos;re a little short on Cites ({balance}/{citesRequired}). Top up on
                        Cites, subscribe to Pro for a monthly refill, or invite a friend. You both get
                        50 Cites when they sign up with your code.
                      </p>
                      <div className="topup-actions">
                        <Link href="/cites">
                          <Button variant="accent">Open Cites</Button>
                        </Link>
                        <Link href="/upgrade">
                          <Button variant="primary">
                            {isPro ? 'Open Plan' : 'Compare Plans'}
                          </Button>
                        </Link>
                        <Link href="/cites#refer">
                          <Button variant="ghost">Refer a Friend</Button>
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {sentences.length > 0 ? (
                    <ChatCollapse
                      title="Sentences to Cite"
                      meta={`${sentences.length}`}
                      defaultOpen={sentences.length <= 8}
                    >
                      <ul className="sentence-list">
                        {sentences.map((s) => (
                          <li key={s.index}>
                            <span className="sentence-index">{s.index + 1}</span>
                            <span>{s.text}</span>
                          </li>
                        ))}
                      </ul>
                    </ChatCollapse>
                  ) : null}

                  {enough && citesRequired > 0 ? (
                    <div className="chat-actions chat-actions--full">
                      <Button variant="accent" onClick={generate}>
                        Generate Citations
                      </Button>
                    </div>
                  ) : !enough ? null : generationId ? (
                    <div className="chat-actions chat-actions--full">
                      <Link href={`/c/${generationId}`}>
                        <Button variant="accent">View in Library</Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {phase === 'error' && error && !showTheater ? (
                <p className="chat-error">{error}</p>
              ) : null}

              {phase === 'done' && result ? (
                <div className="analysis-results">
                  <p className="chat-agent-lead">
                    Nice work! Your citations are ready and your bibliography is right below.
                  </p>
                  {generationId ? (
                    <div className="chat-actions">
                      <Link href={`/c/${generationId}`} className="chat-text-link">
                        Open in Library
                      </Link>
                    </div>
                  ) : null}

                  <div className="result-section">
                    <div className="result-section__head">
                      <h3 className="result-section__title">Cited Draft</h3>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => void copyText('essay', formatEssayForDisplay(displayEssay))}
                      >
                        {copied === 'essay' ? 'Copied' : 'Copy Draft'}
                      </Button>
                    </div>
                    <pre className="essay-output">{formatEssayForDisplay(displayEssay)}</pre>
                  </div>

                  {correctionCount > 0 ? (
                    <ChatCollapse title="Suggested Corrections" meta={`${correctionCount}`}>
                      <ul className="corrections">
                        {result.citations
                          .filter((c) => c.correction)
                          .map((c) => (
                            <li key={c.index}>
                              <p className="pg-subtle">Original</p>
                              <p>{c.sentence}</p>
                              <p className="pg-subtle">Suggested</p>
                              <p>{c.correction}</p>
                              <Button
                                size="sm"
                                variant={acceptedCorrections[c.index] ? 'accent' : 'ghost'}
                                onClick={() =>
                                  setAcceptedCorrections((prev) => ({
                                    ...prev,
                                    [c.index]: !prev[c.index],
                                  }))
                                }
                              >
                                {acceptedCorrections[c.index] ? 'Accepted' : 'Accept'}
                              </Button>
                            </li>
                          ))}
                      </ul>
                    </ChatCollapse>
                  ) : null}

                  <div className="result-section">
                    <div className="result-section__head">
                      <h3 className="result-section__title">
                        Bibliography
                        <span className="result-section__meta">{result.bibliography.length}</span>
                      </h3>
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() =>
                          void copyText(
                            'bibliography',
                            formatBibliographyForCopy(result.bibliography),
                          )
                        }
                      >
                        {copied === 'bibliography' ? 'Copied' : 'Copy Bibliography'}
                      </Button>
                    </div>
                    <ol className="bibliography">
                      {result.bibliography.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : null}
            </section>

            {showTheater ? (
              <section className="analysis-theater" aria-label="Citation progress">
                <GenerationTheater
                  embedded
                  essay={theaterEssay}
                  sentences={sentences}
                  live={theaterLive}
                  activeIndexes={activeIndexes}
                  stages={sentenceStages}
                  progress={progress}
                  statusMessage={statusMessage}
                  title={draftTitle}
                  styleId={settings.styleId}
                  possibleMatches={possibleMatches}
                  mode={
                    phase === 'theater_done' ? 'complete' : phase === 'error' ? 'error' : 'running'
                  }
                  error={error}
                  onViewDraft={onViewDraft}
                  onRetry={onTheaterRetry}
                  allowSentenceRetry={isPro}
                  retryingIndex={retryingIndex}
                  onRetrySentence={(idx) => void retrySentence(idx)}
                  onLockedRetry={() => setUpsell({ feature: 'retry' })}
                />
              </section>
            ) : null}
          </div>
        ) : null}

        {showComposer ? (
        <div className="composer">
          <div
            className="composer-prefs"
            ref={prefsRef}
            role="group"
            aria-label="Citation options"
            onMouseLeave={() => setStyleRailCollapsed(false)}
          >
            <div ref={styleSlotRef} className="composer-style-slot">
              <button
                ref={styleChipRef}
                type="button"
                className="pref-chip pref-chip--style"
                disabled={busy}
                aria-haspopup="listbox"
                aria-expanded={styleRailRevealed}
                onMouseEnter={openStyleRail}
                onMouseLeave={scheduleCloseStyleRail}
              >
                <span className="pref-chip__label">Style</span>
                <span className="pref-chip__value">{styleLabel}</span>
              </button>
            </div>

            <div
              ref={prefsRightRef}
              className={`composer-prefs__right ${styleRailRevealed ? 'is-faded-out' : ''}`}
              aria-hidden={styleRailRevealed}
            >
              <PrefToggle
                label="In-Text Citations"
                value={settings.inText ? 'Enabled' : 'Disabled'}
                off={!settings.inText}
                disabled={busy}
                onClick={() => setSettings((s) => ({ ...s, inText: !s.inText }))}
              />
              <span className="composer-prefs__dot" aria-hidden>
                ·
              </span>
              <PrefToggle
                label="Suggestions"
                value={
                  suggestionsAvailable
                    ? settings.suggestCorrections
                      ? 'Enabled'
                      : 'Disabled'
                    : 'Disabled'
                }
                off={!suggestionsAvailable || !settings.suggestCorrections}
                locked={!suggestionsAvailable}
                disabled={busy}
                onClick={() => {
                  if (!suggestionsAvailable) {
                    setUpsell({ feature: 'suggestions' })
                    return
                  }
                  setSettings((s) => ({ ...s, suggestCorrections: !s.suggestCorrections }))
                }}
              />
              <span className="composer-prefs__dot" aria-hidden>
                ·
              </span>
              <PrefToggle
                label="Recency"
                value={isPro ? recencyLabel : 'Any'}
                locked={!isPro}
                disabled={busy}
                onClick={cycleRecency}
              />
              <span className="composer-prefs__dot" aria-hidden>
                ·
              </span>
              <PrefToggle
                label="Sources"
                value={
                  settings.sourceTier === 'academic' ? 'Academic Only' : 'Academic & Web'
                }
                disabled={busy}
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    sourceTier: (s.sourceTier === 'academic' ? 'any' : 'academic') as SourceTier,
                  }))
                }
              />
            </div>

            <div
              ref={styleRailHostRef}
              className={`style-rail-host ${styleRailRevealed ? 'is-open' : ''} ${styleRailCollapsed ? 'is-collapsed' : ''}`}
              aria-hidden={!styleRailRevealed}
              onMouseEnter={openStyleRail}
              onMouseLeave={scheduleCloseStyleRail}
            >
              <div
                ref={styleRailRef}
                className="style-rail"
                onWheel={(e) => {
                  const rail = styleRailRef.current
                  if (!rail || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
                  e.preventDefault()
                  rail.scrollLeft += e.deltaY
                }}
              >
                <div className="style-rail-track" role="listbox" aria-label="Referencing style">
                  {REFERENCING_STYLES.filter((s) => s.id !== settings.styleId).map((s) => {
                    const locked = s.proOnly && !isPro
                    return (
                      <button
                        key={s.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className={`style-rail__option ${locked ? 'style-rail__option--locked' : ''}`.trim()}
                        disabled={busy}
                        title={locked ? s.tease : undefined}
                        onClick={() => {
                          if (locked) {
                            setUpsell({ feature: 'styles', detail: s.label })
                            setStyleRailCollapsed(true)
                            setStyleRailOpen(false)
                            return
                          }
                          setSettings((prev) => ({ ...prev, styleId: s.id }))
                          setStyleRailCollapsed(true)
                          setStyleRailOpen(false)
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="composer-frame">
            <textarea
              ref={textareaRef}
              className="composer-input"
              placeholder="Paste your draft here…"
              value={essay}
              onChange={(e) => setEssay(e.target.value)}
              disabled={busy}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canAnalyze) {
                  e.preventDefault()
                  void analyze()
                }
              }}
            />

            <div className="composer-footer">
              <div className="composer-footer__counts">
                <span className="composer-footer__count">
                  {essay.trim().length.toLocaleString()} Characters
                </span>
                <span
                  className={`composer-footer__count composer-word-limit ${overWordLimit ? 'is-over' : ''}`.trim()}
                >
                  {wordCount.toLocaleString()}
                  {!isPro ? ` / ${BASIC_MAX_WORDS.toLocaleString()}` : ''} Words
                  {overWordLimit ? (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="composer-word-limit__link"
                        onClick={() =>
                          setUpsell({
                            feature: 'words',
                            detail: BASIC_MAX_WORDS.toLocaleString(),
                          })
                        }
                      >
                        Unlock longer drafts
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
              <Button
                variant="accent"
                size="sm"
                className="composer-analyze"
                disabled={!canAnalyze}
                onClick={() => {
                  if (overWordLimit) {
                    setUpsell({ feature: 'words', detail: BASIC_MAX_WORDS.toLocaleString() })
                    return
                  }
                  void analyze()
                }}
              >
                Analyze Draft
              </Button>
            </div>
          </div>
        </div>
        ) : null}
      </div>
      <ProUpsellDialog
        open={upsell != null}
        onClose={() => setUpsell(null)}
        feature={upsell?.feature ?? 'generic'}
        detail={upsell?.detail}
      />
    </div>
  )
}
