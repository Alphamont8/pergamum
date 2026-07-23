'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { REFERENCING_STYLES, labelForStyle } from '@/utils/referencingStyle'
import type { LiveSentenceState } from '@/lib/essay/liveSegments'
import type { CitationPipelineStage } from '@/lib/cite/stages'
import { ProUpsellDialog } from '@/components/billing/ProUpsellDialog'
import type { ProUpsellFeature } from '@/lib/billing/proUpsell'
import { BASIC_MAX_WORDS } from '@/lib/billing/plans'
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
import { AgentTimeline, type FeedPhaseTask } from './AgentTimeline'
import { LiveEssayCanvas } from './LiveEssayCanvas'
import type { ActivityLogEntry, BibChip, PossibleMatchChip } from './PipelineActivityRail'
import { readApiErrorMessage, parseSseEventData, humanizeApiErrorText } from '@/lib/http/apiError'
import { alignSentencesToEssay, countWords } from '@/lib/essay/alignSentences'
import { reasoningImpliesCitations } from '@/lib/format/agentReasoning'
import { formatAnalysisReasoning } from '@/lib/format/agentReasoning'
import {
  analyzeStepCopy,
  feedDoneCopy,
  formatGenerationReasoning,
  generationStageDetail,
  searchStepCopy,
} from '@/lib/format/feedCopy'
import { formatEssayForDisplay } from '@/lib/essay/format'
import './chat.css'
import './agent-timeline.css'
import './generation-theater.css'

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

const COMPOSER_DRAFT_MIN_H = 151
const COMPOSER_DRAFT_MAX_H = 227

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
  const [sourceLinks, setSourceLinks] = useState('')
  const [settings, setSettings] = useState<GenerationSettings>(makeDefaultSettings)
  const [pickingMatch, setPickingMatch] = useState<number | null>(null)
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
  const [analysisReasoning, setAnalysisReasoning] = useState<string | null>(null)
  const [analyzeDurationSec, setAnalyzeDurationSec] = useState<number | null>(null)
  const [feedFocusIndex, setFeedFocusIndex] = useState<number | null>(null)
  const analyzeStartedAtRef = useRef<number | null>(null)
  const [generateDurationSec, setGenerateDurationSec] = useState<number | null>(null)
  const generateStartedAtRef = useRef<number | null>(null)
  const [generateDetail, setGenerateDetail] = useState<string | null>(null)
  const [generationReasoning, setGenerationReasoning] = useState<string | null>(null)
  const [liveClockMs, setLiveClockMs] = useState<number | null>(null)
  const [analysisStatus, setAnalysisStatus] = useState('')
  const [draftTitle, setDraftTitle] = useState<string | null>(null)
  const logSeqRef = useRef(0)
  const streamRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sourceLinksRef = useRef<HTMLTextAreaElement>(null)
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
    setSourceLinks('')
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
    setAnalyzeDurationSec(null)
    setGenerateDurationSec(null)
    setGenerateDetail(null)
    setGenerationReasoning(null)
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
    if (phase !== 'analyzing' && phase !== 'generating') {
      setLiveClockMs(null)
      return
    }
    setLiveClockMs(Date.now())
    const id = window.setInterval(() => setLiveClockMs(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [phase])

  useEffect(() => {
    const el = textareaRef.current
    const composer = composerRef.current
    if (!el) return

    const syncDraftHeight = () => {
      const styles = getComputedStyle(el)
      const minHeight = parseFloat(styles.minHeight) || COMPOSER_DRAFT_MIN_H
      const maxHeight = parseFloat(styles.maxHeight) || COMPOSER_DRAFT_MAX_H
      el.style.height = 'auto'
      const next = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
      el.style.height = `${next}px`
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
      const linksHeight = Math.round(next * 0.6)
      composer?.style.setProperty('--composer-draft-h', `${next}px`)
      composer?.style.setProperty('--composer-links-h', `${linksHeight}px`)
      const linksEl = sourceLinksRef.current
      if (linksEl) linksEl.style.height = `${linksHeight}px`
    }

    syncDraftHeight()
    window.addEventListener('resize', syncDraftHeight)
    return () => window.removeEventListener('resize', syncDraftHeight)
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
      setSourceLinks(typeof draft.sourceLinks === 'string' ? draft.sourceLinks : '')
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
    if (!essay.trim() && !sourceLinks.trim() && settingsMatchDefaults(settings, draftDefaults, suggestionsAvailable)) {
      clearComposerDraft(userId)
      return
    }
    saveComposerDraft(userId, { essay, settings, sourceLinks })
  }, [draftDefaults, essay, phase, settings, sourceLinks, suggestionsAvailable, userId])

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
    setAnalyzeDurationSec(null)
    setGenerateDurationSec(null)
    setGenerateDetail(null)
    setGenerationReasoning(null)
    analyzeStartedAtRef.current = Date.now()
    generateStartedAtRef.current = null
    logSeqRef.current = 0
    setTheaterLive({})
    setActiveIndexes([])
    setSentenceStages({})
    setActivityLog([])
    setLiveBibliography([])
    setPossibleMatches({})
    setFeedFocusIndex(null)
    setStatusMessage('Analyzing your draft for claims that need a source…')
    setAnalysisStatus('Analyzing your draft for claims that need a source…')

    const pushAnalyzeLog = (message: string, detail: string) => {
      logSeqRef.current += 1
      const entry: ActivityLogEntry = {
        id: `${logSeqRef.current}-${Date.now()}`,
        message,
        detail,
        stage: 'analyze',
        at: Date.now(),
      }
      setActivityLog((prev) => [...prev, entry].slice(-120))
    }

    const readStep = analyzeStepCopy('read')
    pushAnalyzeLog(readStep.message, readStep.detail)

    const progressTimers: number[] = []
    progressTimers.push(
      window.setTimeout(() => {
        const claimsStep = analyzeStepCopy('claims')
        pushAnalyzeLog(claimsStep.message, claimsStep.detail)
      }, 1800),
    )
    if (sourceLinks.trim()) {
      progressTimers.push(
        window.setTimeout(() => {
          const linksStep = analyzeStepCopy('links')
          pushAnalyzeLog(linksStep.message, linksStep.detail)
        }, 3200),
      )
    }
    progressTimers.push(
      window.setTimeout(() => {
        const queriesStep = analyzeStepCopy('queries')
        pushAnalyzeLog(queriesStep.message, queriesStep.detail)
      }, sourceLinks.trim() ? 4800 : 3600),
    )

    try {
      const res = await fetch('/api/cite/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          essay,
          settings: {
            ...settings,
            sourceLinks: sourceLinks.trim() || undefined,
          },
        }),
      })
      if (res.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent('/')}&error=session`)
        return
      }
      const analyzeBody = await res.text()
      let data: {
        code?: string
        error?: string
        generationId?: string
        title?: string
        reasoning?: string
        sentences?: AnalyzedSentence[]
        balance?: number
        enough?: boolean
      } = {}
      try {
        data = JSON.parse(analyzeBody) as typeof data
      } catch {
        if (!res.ok) {
          throw new Error(
            humanizeApiErrorText(analyzeBody, 'We couldn\u2019t analyze your draft.'),
          )
        }
        throw new Error('We couldn\u2019t analyze your draft.')
      }
      if (!res.ok) {
        if (data.code === 'word_limit') {
          setUpsell({ feature: 'words', detail: BASIC_MAX_WORDS.toLocaleString() })
          setPhase('idle')
          setStatusMessage('')
          return
        }
        throw new Error(
          humanizeApiErrorText(
            data.error ?? '',
            'We couldn\u2019t analyze your draft.',
          ),
        )
      }
      if (!data.generationId) {
        throw new Error('We couldn\u2019t analyze your draft.')
      }
      setGenerationId(data.generationId)
      const loadedSentences = alignSentencesToEssay(
        essay,
        Array.isArray(data.sentences) ? (data.sentences as AnalyzedSentence[]) : [],
      )
      setSentences(loadedSentences)
      setCitesRequired(loadedSentences.length)
      setBalance(typeof data.balance === 'number' ? data.balance : 0)
      setEnough(
        typeof data.balance === 'number'
          ? data.balance >= loadedSentences.length
          : Boolean(data.enough),
      )
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
      const initialLive: Record<number, LiveSentenceState> = {}
      for (const s of loadedSentences) {
        initialLive[s.index] = { status: 'pending', sentence: s.text }
      }
      setTheaterLive(initialLive)
      const reasoning =
        typeof data.reasoning === 'string' && data.reasoning.trim()
          ? formatAnalysisReasoning(data.reasoning.trim())
          : null
      setAnalysisReasoning(reasoning)
      if (loadedSentences.length === 0 && reasoning && reasoningImpliesCitations(reasoning)) {
        throw new Error(
          "We found claims in your draft but couldn't match them to sentences. Try again or shorten your draft.",
        )
      }
      if (analyzeStartedAtRef.current) {
        setAnalyzeDurationSec(
          Math.max(1, Math.round((Date.now() - analyzeStartedAtRef.current) / 1000)),
        )
      }
      lastAnalyzeKeyRef.current = cacheKey
      setPhase('quoted')
      const resultStep = analyzeStepCopy('result', {
        count: loadedSentences.length,
        reasoning,
      })
      pushAnalyzeLog(resultStep.message, resultStep.detail)
      setStatusMessage(
        loadedSentences.length === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${loadedSentences.length} sentence${loadedSentences.length === 1 ? '' : 's'} that need a source · ${loadedSentences.length} Cites required`,
      )
      setAnalysisStatus(
        loadedSentences.length === 0
          ? 'Nothing here needs a citation. Your draft looks good to go.'
          : `Found ${loadedSentences.length} sentence${loadedSentences.length === 1 ? '' : 's'} that need a source · ${loadedSentences.length} Cites required`,
      )
      if (loadedSentences.length === 0) {
        dispatchLibrarySync({ action: 'refresh' })
      }
    } catch (err) {
      if (analyzeStartedAtRef.current) {
        setAnalyzeDurationSec(
          Math.max(1, Math.round((Date.now() - analyzeStartedAtRef.current) / 1000)),
        )
      }
      setPhase('error')
      setError(err instanceof Error ? err.message : 'We couldn\u2019t analyze your draft.')
    } finally {
      for (const id of progressTimers) window.clearTimeout(id)
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
    sourceLinks,
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
    generateStartedAtRef.current = Date.now()
    setGenerateDurationSec(null)
    setGenerationReasoning(null)
    setGenerateDetail(generationStageDetail('searching'))
    setActiveIndexes([])
    setSentenceStages({})
    setLiveBibliography([])
    setPossibleMatches({})
    // Keep prior analyze steps in the feed; continue the timeline into generation.

    const initialLive: Record<number, LiveSentenceState> = {}
    for (const s of sentences) {
      initialLive[s.index] = { status: 'pending', sentence: s.text }
    }
    setTheaterLive(initialLive)

    const totalSentences = citesRequired || sentences.length

    const pushLog = (
      message: string,
      detail: string,
      stage: ActivityLogEntry['stage'],
      sentenceIndex?: number,
      options?: { replaceLast?: boolean },
    ) => {
      logSeqRef.current += 1
      const entry: ActivityLogEntry = {
        id: `${logSeqRef.current}-${Date.now()}`,
        message,
        detail,
        stage,
        sentenceIndex,
        at: Date.now(),
      }
      setActivityLog((prev) => {
        if (options?.replaceLast && sentenceIndex != null && prev.length > 0) {
          const last = prev[prev.length - 1]
          if (
            last.sentenceIndex === sentenceIndex &&
            last.stage !== 'found' &&
            last.stage !== 'miss'
          ) {
            return [...prev.slice(0, -1), { ...entry, id: last.id }].slice(-120)
          }
        }
        return [...prev, entry].slice(-120)
      })
    }

    const startStep = searchStepCopy('searching', 1, totalSentences)
    pushLog(startStep.message, startStep.detail, 'searching')

    try {
      const res = await fetch('/api/cite/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId }),
      })

      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, 'Citation generation didn\u2019t finish.'))
      }
      if (!res.body) {
        throw new Error('Citation generation didn\u2019t finish.')
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream')) {
        throw new Error(await readApiErrorMessage(res, 'Citation generation didn\u2019t finish.'))
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
          const data = parseSseEventData(dataLine)

          if (event === 'status') {
            setStatusMessage(String(data.message ?? ''))
            if (typeof data.current === 'number' && typeof data.total === 'number') {
              setProgress({ current: data.current, total: data.total })
            }
          }

          if (event === 'progress') {
            const sentenceIndex =
              typeof data.sentenceIndex === 'number' ? data.sentenceIndex : undefined
            const stepRaw = typeof data.step === 'string' ? data.step : 'searching'
            const step = (PIPELINE_STAGES.has(stepRaw) ? stepRaw : 'searching') as
              | CitationPipelineStage
              | 'searching'
            const progressTotal =
              typeof data.total === 'number' && data.total > 0 ? data.total : totalSentences
            const copy =
              sentenceIndex != null
                ? searchStepCopy(step, sentenceIndex + 1, progressTotal)
                : searchStepCopy('searching', 1, progressTotal)

            setStatusMessage(copy.message)
            setGenerateDetail(generationStageDetail(step))
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
              pushLog(copy.message, copy.detail, step, sentenceIndex, { replaceLast: true })
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
                missReason:
                  status === 'failed' && typeof data.errorMessage === 'string'
                    ? data.errorMessage
                    : undefined,
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
            const citeCopy = searchStepCopy(
              status === 'done' ? 'found' : 'miss',
              sentenceIndex + 1,
              totalSentences,
              {
                sourceTitle: status === 'done' ? title : undefined,
                missReason:
                  status === 'failed' && typeof data.errorMessage === 'string'
                    ? data.errorMessage
                    : undefined,
              },
            )
            pushLog(
              citeCopy.message,
              citeCopy.detail,
              status === 'done' ? 'found' : 'miss',
              sentenceIndex,
            )
            setGenerateDetail(
              generationStageDetail(status === 'done' ? 'found' : 'miss'),
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
            if (generateStartedAtRef.current) {
              setGenerateDurationSec(
                Math.max(1, Math.round((Date.now() - generateStartedAtRef.current) / 1000)),
              )
            }
            const cited = payload.citations.filter((c) => c.status === 'done').length
            const missed = payload.citations.filter((c) => c.status !== 'done').length
            const done = feedDoneCopy()
            setGenerateDetail(done.detail)
            setGenerationReasoning(
              formatGenerationReasoning({
                cited,
                missed,
                total: payload.citations.length,
              }),
            )
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
      if (generateStartedAtRef.current) {
        setGenerateDurationSec(
          Math.max(1, Math.round((Date.now() - generateStartedAtRef.current) / 1000)),
        )
      }
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

  const citedDraftText = useMemo(() => {
    if (!result?.essay) return ''
    let text = result.essay
    for (const c of result.citations) {
      if (!c.correction || !acceptedCorrections[c.index]) continue
      if (text.includes(c.sentence)) {
        text = text.replace(c.sentence, c.correction)
      }
    }
    return formatEssayForDisplay(text)
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

  const showWorkspace = phase !== 'idle'
  const showComposer = phase === 'idle'

  const theaterEssay = result?.originalEssay || essay

  const focusIndex =
    feedFocusIndex ??
    activeIndexes[0] ??
    (progress.current > 0
      ? sentences.find((s) => theaterLive[s.index]?.status === 'done' || theaterLive[s.index]?.status === 'failed')
          ?.index ?? null
      : sentences[0]?.index ?? null)

  const resolvedDraftTitle = useMemo(() => {
    const t = draftTitle?.trim()
    if (t && t !== 'Untitled draft' && t !== 'Untitled') return t
    if (phase === 'analyzing') return 'Analyzing Draft…'
    return 'New Draft'
  }, [draftTitle, phase])

  const pickMatch = useCallback(
    async (sentenceIndex: number, matchIndex: number) => {
      if (!generationId) return
      const match = possibleMatches[sentenceIndex]?.[matchIndex]
      if (!match) return
      setPickingMatch(sentenceIndex)
      try {
        const res = await fetch('/api/cite/accept-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generationId, sentenceIndex, match }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(
            typeof data.error === 'string' ? data.error : "We couldn't apply that source.",
          )
        }
        const citation = data.citation as {
          index: number
          sentence: string
          status: string
          inText?: string
          title?: string
        }
        setTheaterLive((prev) => ({
          ...prev,
          [sentenceIndex]: {
            status: 'done',
            sentence: citation.sentence || prev[sentenceIndex]?.sentence || '',
            inText: citation.inText,
          },
        }))
        setPossibleMatches((prev) => {
          const next = { ...prev }
          delete next[sentenceIndex]
          return next
        })
        if (data.result) setResult(data.result as ResultPayload)
        setPhase('theater_done')
        dispatchLibrarySync({ action: 'refresh' })
      } catch (err) {
        setError(err instanceof Error ? err.message : "We couldn't apply that source.")
      } finally {
        setPickingMatch(null)
      }
    },
    [generationId, possibleMatches],
  )

  const feedTasks = useMemo((): FeedPhaseTask[] => {
    if (phase === 'idle') return []

    const tasks: FeedPhaseTask[] = []
    const analyzeLatest = activityLog.filter((e) => e.stage === 'analyze').at(-1)

    if (phase === 'analyzing') {
      const started = analyzeStartedAtRef.current
      const elapsedMs = started && liveClockMs ? Math.max(0, liveClockMs - started) : 0
      const secs = Math.floor(elapsedMs / 1000)
      tasks.push({
        id: 'analyze',
        label: `Analyzing · ${secs}s`,
        busy: true,
        detail:
          analyzeLatest?.message ||
          statusMessage ||
          'Reading your draft',
      })
      return tasks
    }

    // Analysis finished (quoted / generating / done / error after analyze started).
    if (
      analyzeDurationSec != null ||
      analysisReasoning ||
      sentences.length > 0 ||
      phase === 'quoted' ||
      (phase === 'error' && generateStartedAtRef.current == null)
    ) {
      const analyzeFailed =
        phase === 'error' && generateStartedAtRef.current == null && Boolean(error)
      const resultStep = analyzeStepCopy('result', {
        count: sentences.length,
        reasoning: analysisReasoning,
      })
      const analyzeSecs = analyzeDurationSec ?? 0
      tasks.push({
        id: 'analyze',
        label: analyzeFailed
          ? analyzeSecs > 0
            ? `Couldn't Finish · ${analyzeSecs}s`
            : "Couldn't Finish"
          : analyzeSecs > 0
            ? `Analyzed · ${analyzeSecs}s`
            : 'Analyzed',
        busy: false,
        detail: analyzeFailed ? error! : resultStep.message,
        reasoning: analyzeFailed ? null : analysisReasoning || resultStep.detail,
      })
    }

    if (phase === 'generating') {
      const started = generateStartedAtRef.current
      const elapsedMs = started && liveClockMs ? Math.max(0, liveClockMs - started) : 0
      const secs = Math.floor(elapsedMs / 1000)
      tasks.push({
        id: 'generate',
        label: `Generating · ${secs}s`,
        busy: true,
        detail: generateDetail || generationStageDetail('searching'),
      })
      return tasks
    }

    if (phase === 'theater_done' || (generateDurationSec != null && generateStartedAtRef.current != null)) {
      const done = feedDoneCopy()
      const genSecs = generateDurationSec ?? 0
      const failed = phase === 'error' && Boolean(error)
      tasks.push({
        id: 'generate',
        label: failed
          ? genSecs > 0
            ? `Couldn't Finish · ${genSecs}s`
            : "Couldn't Finish"
          : genSecs > 0
            ? `Generated · ${genSecs}s`
            : 'Generated',
        busy: false,
        detail: failed ? error! : generateDetail || done.message,
        reasoning: failed ? null : generationReasoning || done.detail,
      })
    } else if (phase === 'error' && error && generateStartedAtRef.current != null) {
      tasks.push({
        id: 'generate',
        label: "Couldn't Finish",
        busy: false,
        detail: error,
      })
    }

    return tasks
  }, [
    activityLog,
    analysisReasoning,
    analyzeDurationSec,
    error,
    generateDetail,
    generateDurationSec,
    generationReasoning,
    liveClockMs,
    phase,
    sentences.length,
    statusMessage,
  ])

  const showFeedSentences =
    sentences.length > 0 &&
    (phase === 'quoted' ||
      phase === 'generating' ||
      phase === 'theater_done' ||
      phase === 'error' ||
      phase === 'done')

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
    setGenerateDurationSec(null)
    setGenerateDetail(null)
    setGenerationReasoning(null)
    generateStartedAtRef.current = null
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


  return (
    <div
      className={`chat-page ${showWorkspace ? 'chat-page--workspace' : ''} ${showComposer ? 'chat-page--composer' : ''}`.trim()}
    >
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
          <div className="analysis-workspace analysis-workspace--split" ref={streamRef}>
            <section className="workspace-draft" aria-label="Your draft">
              <div className="workspace-draft__head">
                <p className="workspace-draft__eyebrow">Live Draft</p>
                <h2 className="workspace-draft__title">{resolvedDraftTitle}</h2>
                <p className="workspace-draft__meta">
                  {countWords(essay).toLocaleString()} Words · {styleLabel}
                  {progress.total > 0
                    ? ` · ${progress.current}/${progress.total} Cited`
                    : sentences.length > 0
                      ? ` · ${sentences.length} To Cite`
                      : ''}
                </p>
              </div>
              <div className="workspace-draft__canvas">
                {phase === 'theater_done' && citedDraftText ? (
                  <pre className="workspace-draft__fallback">{citedDraftText}</pre>
                ) : sentences.length > 0 ? (
                  <LiveEssayCanvas
                    essay={theaterEssay}
                    sentences={sentences}
                    live={theaterLive}
                    focusIndex={
                      phase === 'generating' || phase === 'quoted' || pickingMatch != null
                        ? focusIndex
                        : null
                    }
                    styleId={settings.styleId}
                  />
                ) : (
                  <pre className="workspace-draft__fallback">{formatEssayForDisplay(essay)}</pre>
                )}
              </div>
            </section>

            <section className="workspace-status" aria-label="Citation Feed">
              <AgentTimeline
                tasks={feedTasks}
                liveClockMs={liveClockMs ?? undefined}
                showSentences={showFeedSentences}
                sentences={sentences.map((s) => ({ index: s.index, text: s.text }))}
                live={theaterLive}
                stages={sentenceStages}
                possibleMatches={possibleMatches}
                focusSentenceIndex={focusIndex}
                onSentenceFocus={setFeedFocusIndex}
                onPickMatch={(sentenceIndex, matchIndex) => {
                  void pickMatch(sentenceIndex, matchIndex)
                }}
                pickingMatch={pickingMatch}
                footerCentered={
                  (phase === 'quoted' && citesRequired === 0 && Boolean(generationId)) ||
                  (phase === 'theater_done' && Boolean(generationId))
                }
                footer={
                  <>
                    {phase === 'quoted' && citesRequired > 0 ? (
                      <>
                        {!enough ? (
                          <div className="topup-prompt">
                            <p>
                              You&apos;re a little short on Cites ({balance}/{citesRequired}). Top up
                              on Cites, subscribe to Pro for a monthly refill, or invite a friend.
                            </p>
                            <div className="topup-actions">
                              <Link href="/cites">
                                <Button variant="accent" size="sm">
                                  Open Cites
                                </Button>
                              </Link>
                              <Link href="/upgrade">
                                <Button variant="primary" size="sm">
                                  {isPro ? 'Open Plan' : 'Compare Plans'}
                                </Button>
                              </Link>
                            </div>
                          </div>
                        ) : (
                          <Button variant="accent" onClick={generate}>
                            Generate Citations
                          </Button>
                        )}
                      </>
                    ) : null}
                    {phase === 'quoted' && citesRequired === 0 && generationId ? (
                      <Link href={`/c/${generationId}`}>
                        <Button variant="accent">View in Library</Button>
                      </Link>
                    ) : null}
                    {phase === 'theater_done' && generationId ? (
                      <Button variant="accent" onClick={onViewDraft}>
                        Open Draft
                      </Button>
                    ) : null}
                    {phase === 'error' && error ? (
                      <Button variant="accent" onClick={onTheaterRetry}>
                        Try Again
                      </Button>
                    ) : null}
                  </>
                }
              />
            </section>
          </div>
        ) : null}

        {showComposer ? (
        <div className="composer" ref={composerRef}>
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

          <div className="composer-links">
            <textarea
              ref={sourceLinksRef}
              className="composer-links__input"
              placeholder="If any, paste your source URLs or DOIs that you've used…"
              value={sourceLinks}
              onChange={(e) => setSourceLinks(e.target.value)}
              disabled={busy}
            />
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
