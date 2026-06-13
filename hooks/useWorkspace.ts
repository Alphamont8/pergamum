"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  blueprintInputFingerprint,
  mergeOutlineWithBudget,
  wordBudgetSnapshotJson,
} from '@/lib/blueprint-sync'
import { attachInitialSourcesToOutline } from '@/lib/outline-sources'
import {
  createHistoryStacks,
  popRedo,
  popUndo,
  pushHistorySnapshot,
} from '@/lib/essay-history'
import { essayToPersisted } from '@/lib/project-state'
import { saveGuestEssay } from '@/lib/guest/storage'
import type { ToolCallPayload } from '@/lib/ai/tools'
import { navToTabKind, type AppNavId } from '../constants/navigation'
import {
  cycleThemePreference,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme'
import { ALL_TAB_ORDER, TAB_LABELS } from '../constants/tabs'
import {
  applyWordBudgetTemplate,
  computeAutoWordLimit,
  PLAN_WORD_LIMITS,
  rebalanceWordBudgetSections,
} from '../constants/blueprintSettings'
import {
  contentToHtml,
  createInitialEssayState,
  createDraftSectionsFromBudget,
  createInitialQuickSettings,
  createInitialWordLimit,
  getChildTypeForParent,
  mockOutlineFromBlueprint,
  recalcSectionWordCount,
  syncBlueprintResolvedFields,
} from '../state/essayInitial'
import {
  createEmptyToolState,
} from '@/lib/draft-utils'
import {
  clearCitationEngineCache,
  convertCitationTokensInHtml,
  convertCitationTokensInPlain,
  extractAllCitationSpans,
  formatDraftCitationsAsync,
  formatInTextCitation,
  buildCitationSpanHtml,
  reconcileDraftSections,
  restyleDraftCitations,
} from '@/lib/citations'
import { referencingStyleToCitationStyle } from '@/utils/referencingStyle'
import {
  DRAFT_TOOL_DEFS,
  getDefaultToolScope,
  getDraftToolDef,
  isSelectionTool,
  getDraftToolsByCategory,
  type DraftToolCategory,
  type RunDraftToolOptions,
} from '@/lib/draft-tools'
import { parseInstructionsFromText } from '../services/essay/parseInstructions'
import {
  analyzeInstructions,
  generateDraftSection as generateDraftSectionStub,
  runDraftToolStub,
  searchSourcesForNode,
} from '../services/essay/stubs'
import type {
  BlueprintAnalysis,
  CitationStyle,
  DraftMode,
  DraftSuggestion,
  DraftToolKind,
  DraftToolScope,
  EssayBlueprint,
  EssayState,
  InstructionAttachmentKind,
  OutlineNode,
  OutlineNodeType,
  SourceAddedVia,
  SourceRecord,
  SourceSearchResult,
  ReferencingStyleId,
  SourceReliability,
  SourceType,
  SubscriptionTier,
  TabDisplayMode,
  TextSelectionRange,
  WorkspaceTab,
  WorkspaceView,
} from '../types'

function buildInitialTabs(): WorkspaceTab[] {
  return ALL_TAB_ORDER.map((kind, order) => ({
    id: `tab-${kind}`,
    kind,
    label: TAB_LABELS[kind],
    closed: kind !== 'blueprint',
    displayMode: 'fullscreen' as const,
    order,
  }))
}

export interface UseWorkspaceOptions {
  projectId?: string
  initialEssay?: EssayState
  subscriptionTier?: SubscriptionTier
  activeNavId?: AppNavId
  onNavigate?: (navId: AppNavId) => void
  /** Not logged in: Basic tier, persist essay to localStorage only */
  guestMode?: boolean
}

export function useWorkspace(options: UseWorkspaceOptions = {}) {
  const {
    projectId,
    initialEssay,
    subscriptionTier: tierProp = 'Plus',
    activeNavId: activeNavIdProp,
    onNavigate,
    guestMode = false,
  } = options
  const [tabs, setTabs] = useState<WorkspaceTab[]>(buildInitialTabs)
  const [view, setView] = useState<WorkspaceView>({
    layout: 'single',
    focusedTabId: 'tab-blueprint',
    pairedTabId: null,
    splitRatio: 0.5,
  })
  const [essay, setEssay] = useState<EssayState>(
    () => initialEssay ?? createInitialEssayState(),
  )
  const subscriptionTier = tierProp
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [generatingOutline, setGeneratingOutline] = useState(false)
  const [generatingFullDraft, setGeneratingFullDraft] = useState(false)
  const [draftToolScopes, setDraftToolScopes] = useState<Partial<Record<DraftToolKind, DraftToolScope>>>(
    {},
  )
  const [highlightedSuggestionId, setHighlightedSuggestionId] = useState<string | null>(null)
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(() => new Set())
  const [evaluatingIds, setEvaluatingIds] = useState<Set<string>>(() => new Set())
  const [bulkEnriching, setBulkEnriching] = useState(false)
  const [bulkEvaluating, setBulkEvaluating] = useState(false)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  const [themePreference, setThemePreference] = useState<ThemePreference>('system')
  const essayRef = useRef(essay)
  essayRef.current = essay
  const formatDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyRef = useRef(createHistoryStacks())
  const [historyTick, setHistoryTick] = useState(0)

  const handleQuotaResponse = useCallback(async (res: Response): Promise<boolean> => {
    if (res.status !== 429) return false
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    setQuotaError(data.error ?? 'Monthly AI usage limit reached. Upgrade your plan for more.')
    return true
  }, [])

  const scheduleFormatDraftCitations = useCallback(() => {
    if (formatDraftTimerRef.current) clearTimeout(formatDraftTimerRef.current)
    formatDraftTimerRef.current = setTimeout(() => {
      void (async () => {
        const current = essayRef.current
        const styleId = current.blueprint.referencingStyleId
        if (styleId === 'none') return
        const result = await formatDraftCitationsAsync(
          current.draft.sections,
          current.sources,
          styleId,
        )
        setEssay((e) => ({
          ...e,
          draft: {
            ...e.draft,
            sections: e.draft.sections.map((s) => {
              const updated = result.sections.find((u) => u.id === s.id)
              if (!updated) return s
              return {
                ...s,
                html: updated.html,
                content: updated.content,
                wordCount: recalcSectionWordCount(updated.content),
              }
            }),
          },
          citations: result.citations,
        }))
      })()
    }, 400)
  }, [])

  const recordHistory = useCallback(() => {
    historyRef.current = pushHistorySnapshot(historyRef.current, essayRef.current)
    setHistoryTick((t) => t + 1)
  }, [])

  const undo = useCallback(() => {
    const { stacks, state } = popUndo(historyRef.current, essayRef.current)
    if (!state) return
    historyRef.current = stacks
    setEssay(state)
    setHistoryTick((t) => t + 1)
  }, [])

  const redo = useCallback(() => {
    const { stacks, state } = popRedo(historyRef.current, essayRef.current)
    if (!state) return
    historyRef.current = stacks
    setEssay(state)
    setHistoryTick((t) => t + 1)
  }, [])

  const canUndo = historyRef.current.undo.length > 0
  const canRedo = historyRef.current.redo.length > 0
  void historyTick

  useEffect(() => {
    setThemePreference(readThemePreference())
  }, [])

  useEffect(() => {
    setEssay((e) => ({
      ...e,
      blueprint: syncBlueprintResolvedFields(e.blueprint, subscriptionTier),
    }))
  }, [subscriptionTier])

  useEffect(() => {
    const resolved = resolveTheme(themePreference)
    document.documentElement.setAttribute('data-theme', resolved)
    writeThemePreference(themePreference)
  }, [themePreference])

  useEffect(() => {
    if (themePreference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.setAttribute(
        'data-theme',
        mq.matches ? 'dark' : 'light',
      )
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [themePreference])

  const cycleTheme = useCallback(() => {
    setThemePreference((pref) => cycleThemePreference(pref))
  }, [])

  const openTabs = useMemo(
    () => tabs.filter((t) => !t.closed).sort((a, b) => a.order - b.order),
    [tabs],
  )

  const managerTabs = useMemo(
    () => [...tabs].sort((a, b) => a.order - b.order),
    [tabs],
  )

  const viewedTabIds = useMemo(() => {
    if (view.layout === 'split' && view.focusedTabId && view.pairedTabId) {
      return [view.focusedTabId, view.pairedTabId]
    }
    if (view.focusedTabId) return [view.focusedTabId]
    return []
  }, [view])

  const activeNavId = (activeNavIdProp ??
    essay.workspaceContext.activeNavId) as AppNavId

  useEffect(() => {
    if (activeNavIdProp && activeNavIdProp !== essay.workspaceContext.activeNavId) {
      setEssay((e) => ({
        ...e,
        workspaceContext: { ...e.workspaceContext, activeNavId: activeNavIdProp },
      }))
    }
  }, [activeNavIdProp, essay.workspaceContext.activeNavId])

  const activeTabKind = useMemo(
    () => navToTabKind(activeNavId) ?? 'blueprint',
    [activeNavId],
  )

  useEffect(() => {
    if (!projectId) return
    const t = setTimeout(async () => {
      setSaving(true)
      try {
        if (guestMode) {
          saveGuestEssay(projectId, essay)
        } else {
          await fetch(`/api/projects/${projectId}/state`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(essayToPersisted(essay)),
          })
        }
      } catch {
        /* offline */
      } finally {
        setSaving(false)
      }
    }, 1200)
    return () => clearTimeout(t)
  }, [essay, projectId, guestMode])

  const saveProgress = useCallback(async () => {
    if (!projectId) return
    setSaving(true)
    try {
      if (guestMode) {
        saveGuestEssay(projectId, essay)
      } else {
        await fetch(`/api/projects/${projectId}/state`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(essayToPersisted(essay)),
        })
      }
    } catch {
      /* offline */
    } finally {
      setSaving(false)
    }
  }, [essay, projectId, guestMode])

  const navigateApp = useCallback((navId: AppNavId) => {
    if (onNavigate) {
      onNavigate(navId)
    }
    const tabKind = navToTabKind(navId)

    setEssay((e) => ({
      ...e,
      workspaceContext: {
        ...e.workspaceContext,
        activeNavId: navId,
        activeTabKind: tabKind ?? e.workspaceContext.activeTabKind,
        ...(navId === 'draft' ? { draftSubView: 'editing' as const, draftMode: 'write' as const } : {}),
      },
    }))

    if (tabKind) {
      const tabId = `tab-${tabKind}`
      setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, closed: false } : t)))
      setView((v) => ({
        ...v,
        layout: 'single',
        focusedTabId: tabId,
        pairedTabId: null,
      }))
    }
  }, [onNavigate])

  const workflow = useMemo(
    () => ({
      blueprintApproved: essay.blueprint.approvedAt != null,
      outlineReadyForDraft: essay.outline.readyForDraftAt != null,
      draftHasContent: essay.draft.sections.some((s) => s.content.trim().length > 0),
      draftEverGenerated: essay.draft.generatedAt != null,
      hasCitations: essay.citations.length > 0,
      instructionsComplete: essay.blueprint.approvedAt != null,
      blueprintGenerated: essay.blueprint.frameworkGenerated,
    }),
    [essay],
  )

  const getNextOpenTabId = useCallback((tabId: string, tabsList: WorkspaceTab[]) => {
    const open = tabsList.filter((t) => !t.closed).sort((a, b) => a.order - b.order)
    const idx = open.findIndex((t) => t.id === tabId)
    if (idx < 0 || open.length < 2) return null
    return open[(idx + 1) % open.length].id
  }, [])

  const getPrevOpenTabId = useCallback((tabId: string, tabsList: WorkspaceTab[]) => {
    const open = tabsList.filter((t) => !t.closed).sort((a, b) => a.order - b.order)
    const idx = open.findIndex((t) => t.id === tabId)
    if (idx < 0 || open.length < 2) return null
    return open[(idx - 1 + open.length) % open.length].id
  }, [])

  const swapOrderInTabs = useCallback((idA: string, idB: string) => {
    setTabs((prev) => {
      const a = prev.find((t) => t.id === idA)
      const b = prev.find((t) => t.id === idB)
      if (!a || !b) return prev
      return prev.map((t) => {
        if (t.id === idA) return { ...t, order: b.order }
        if (t.id === idB) return { ...t, order: a.order }
        return t
      })
    })
  }, [])

  const setSplitRatio = useCallback((ratio: number) => {
    setView((v) => ({
      ...v,
      splitRatio: Math.min(0.85, Math.max(0.15, ratio)),
    }))
  }, [])

  const reorderTabs = useCallback((orderedIds: string[]) => {
    setTabs((prev) =>
      prev.map((t) => {
        const order = orderedIds.indexOf(t.id)
        return order >= 0 ? { ...t, order } : t
      }),
    )
  }, [])

  const navigateToTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.map((t) => (t.id === tabId ? { ...t, closed: false } : t))
        setView((v) => {
          if (v.layout === 'split') {
            const paired = getNextOpenTabId(tabId, next)
            return {
              ...v,
              focusedTabId: tabId,
              pairedTabId: paired && paired !== tabId ? paired : null,
              layout: paired && paired !== tabId ? 'split' : 'single',
            }
          }
          return { ...v, layout: 'single', focusedTabId: tabId, pairedTabId: null }
        })
        return next
      })
    },
    [getNextOpenTabId],
  )

  const setFocusedTabFromScroll = useCallback((tabId: string) => {
    setView((v) => ({ ...v, focusedTabId: tabId }))
  }, [])

  const toggleTabLayout = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const next = prev.map((t) =>
          t.id === tabId
            ? {
                ...t,
                displayMode: (t.displayMode === 'fullscreen' ? 'half' : 'fullscreen') as TabDisplayMode,
              }
            : t,
        )
        setView((v) => {
          if (v.layout === 'single') {
            const open = next.filter((t) => !t.closed).sort((a, b) => a.order - b.order)
            const paired = getNextOpenTabId(tabId, open)
            return {
              ...v,
              layout: 'split',
              focusedTabId: tabId,
              pairedTabId: paired && paired !== tabId ? paired : null,
            }
          }
          return {
            ...v,
            layout: 'single',
            focusedTabId: tabId,
            pairedTabId: null,
          }
        })
        return next
      })
    },
    [getNextOpenTabId],
  )

  const moveTabSequence = useCallback(
    (tabId: string, direction: 'left' | 'right') => {
      const open = tabs.filter((t) => !t.closed).sort((a, b) => a.order - b.order)
      const idx = open.findIndex((t) => t.id === tabId)
      if (idx < 0) return

      if (view.layout === 'single') {
        const neighborIdx = direction === 'left' ? idx - 1 : idx + 1
        if (neighborIdx < 0 || neighborIdx >= open.length) return
        swapOrderInTabs(tabId, open[neighborIdx].id)
        return
      }

      const isLeft = view.focusedTabId === tabId
      const isRight = view.pairedTabId === tabId

      if (isLeft && direction === 'right' && view.pairedTabId) {
        setView((v) => ({
          ...v,
          focusedTabId: v.pairedTabId,
          pairedTabId: v.focusedTabId,
        }))
        return
      }
      if (isRight && direction === 'left' && view.focusedTabId) {
        setView((v) => ({
          ...v,
          focusedTabId: v.pairedTabId,
          pairedTabId: v.focusedTabId,
        }))
        return
      }
      if (isLeft && direction === 'left') {
        const prevId = getPrevOpenTabId(tabId, tabs)
        if (!prevId) return
        swapOrderInTabs(tabId, prevId)
        setView((v) => ({ ...v, focusedTabId: prevId }))
        return
      }
      if (isRight && direction === 'right') {
        const nextId = getNextOpenTabId(tabId, tabs)
        if (!nextId) return
        swapOrderInTabs(tabId, nextId)
        setView((v) => ({ ...v, pairedTabId: nextId }))
      }
    },
    [tabs, view, swapOrderInTabs, getPrevOpenTabId, getNextOpenTabId],
  )

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, closed: true } : t)),
      )
      setView((v) => {
        if (v.focusedTabId === id && v.pairedTabId) {
          return { ...v, focusedTabId: v.pairedTabId, pairedTabId: null, layout: 'single' }
        }
        if (v.pairedTabId === id) {
          return { ...v, pairedTabId: null, layout: 'single' }
        }
        if (v.focusedTabId === id) {
          const remaining = tabs
            .filter((t) => !t.closed && t.id !== id)
            .sort((a, b) => a.order - b.order)
          return {
            ...v,
            focusedTabId: remaining[0]?.id ?? null,
            pairedTabId: null,
            layout: 'single',
          }
        }
        return v
      })
    },
    [tabs],
  )

  const reopenTab = useCallback(
    (id: string) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, closed: false } : t)),
      )
      navigateToTab(id)
    },
    [navigateToTab],
  )

  const updateBlueprint = useCallback(
    (patch: Partial<EssayBlueprint>) => {
      recordHistory()
      setEssay((e) => ({
        ...e,
        blueprint: syncBlueprintResolvedFields({ ...e.blueprint, ...patch }, subscriptionTier),
      }))
    },
    [subscriptionTier, recordHistory],
  )

  const updateInstructionsText = useCallback((text: string) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      blueprint: { ...e.blueprint, instructionsText: text },
    }))
  }, [recordHistory])

  const attachInstructionFile = useCallback(async (file: File) => {
      recordHistory()
      const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setEssay((e) => ({
        ...e,
        blueprint: {
          ...e.blueprint,
          attachments: [
            ...e.blueprint.attachments,
            {
              id,
              fileName: file.name,
              kind: 'material' as InstructionAttachmentKind,
              extractedText: '',
              status: 'parsing',
            },
          ],
        },
      }))

      try {
        const formData = new FormData()
        formData.append('file', file)
        if (projectId) formData.append('projectId', projectId)
        const res = await fetch('/api/ai/extract', { method: 'POST', body: formData })
        if (await handleQuotaResponse(res)) return
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Extraction failed')

        setEssay((e) => ({
          ...e,
          blueprint: syncBlueprintResolvedFields(
            {
              ...e.blueprint,
              attachments: e.blueprint.attachments.map((a) =>
                a.id === id
                  ? { ...a, extractedText: data.text, status: 'parsed' as const }
                  : a,
              ),
              instructionsText: e.blueprint.instructionsText,
            },
            subscriptionTier,
          ),
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Extraction failed'
        setEssay((e) => ({
          ...e,
          blueprint: {
            ...e.blueprint,
            attachments: e.blueprint.attachments.map((a) =>
              a.id === id
                ? { ...a, status: 'error' as const, errorMessage: message }
                : a,
            ),
          },
        }))
      }
    },
    [subscriptionTier, recordHistory],
  )

  const removeInstructionAttachment = useCallback((attachmentId: string) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      blueprint: syncBlueprintResolvedFields(
        {
          ...e.blueprint,
          attachments: e.blueprint.attachments.filter((a) => a.id !== attachmentId),
        },
        subscriptionTier,
      ),
    }))
  }, [subscriptionTier, recordHistory])

  const clearInstructions = useCallback(() => {
    recordHistory()
    const planMax = PLAN_WORD_LIMITS[subscriptionTier]
    setEssay((e) => ({
      ...e,
      blueprint: syncBlueprintResolvedFields(
        {
          ...e.blueprint,
          instructionsText: '',
          attachments: [],
          quickSettings: createInitialQuickSettings(),
          wordLimit: createInitialWordLimit(planMax),
          frameworkGenerated: false,
          analysis: null,
          approvedAt: null,
        },
        subscriptionTier,
      ),
    }))
  }, [subscriptionTier, recordHistory])

  const applyInstructions = useCallback(() => {
    recordHistory()
    setEssay((e) => {
      const text = e.blueprint.instructionsText
      const { quickSettings, wordLimit } = parseInstructionsFromText(text, subscriptionTier)
      const planMax = PLAN_WORD_LIMITS[subscriptionTier]
      const nextLimit = { ...e.blueprint.wordLimit }
      if (wordLimit) {
        Object.assign(nextLimit, wordLimit)
        if (wordLimit.max != null) nextLimit.max = Math.min(wordLimit.max, planMax)
      }
      return {
        ...e,
        blueprint: syncBlueprintResolvedFields(
          {
            ...e.blueprint,
            quickSettings: { ...e.blueprint.quickSettings, ...quickSettings },
            wordLimit: nextLimit,
          },
          subscriptionTier,
        ),
      }
    })
  }, [subscriptionTier, recordHistory])

  const updateQuickSettings = useCallback(
    (patch: Partial<EssayBlueprint['quickSettings']>) => {
      recordHistory()
      const refStyleChanging =
        patch.referencingStyle !== undefined || patch.referencingStyleIsAuto !== undefined
      setEssay((e) => {
        const nextSettings = { ...e.blueprint.quickSettings, ...patch }
        const docType =
          nextSettings.documentTypeIsAuto || nextSettings.documentType === 'Auto'
            ? e.blueprint.documentType
            : nextSettings.documentType
        const synced = syncBlueprintResolvedFields(
          {
            ...e.blueprint,
            quickSettings: nextSettings,
          },
          subscriptionTier,
        )
        const total = synced.wordLimit.max
        return {
          ...e,
          blueprint: {
            ...synced,
            wordBudget: synced.frameworkGenerated
              ? { ...e.blueprint.wordBudget, total }
              : applyWordBudgetTemplate(docType, total),
          },
          citations: refStyleChanging
            ? e.citations.map((c) => ({ ...c, style: synced.citationStyle }))
            : e.citations,
        }
      })
      if (refStyleChanging) {
        clearCitationEngineCache()
        void (async () => {
          const current = essayRef.current
          const styleId = current.blueprint.referencingStyleId
          const { sections, citations } = await restyleDraftCitations(
            current.draft.sections,
            current.sources,
            styleId,
            current.citations,
          )
          setEssay((e) => ({
            ...e,
            draft: {
              ...e.draft,
              sections: e.draft.sections.map((s) => {
                const updated = sections.find((u) => u.id === s.id)
                if (!updated) return s
                return {
                  ...s,
                  html: updated.html,
                  content: updated.content,
                  wordCount: recalcSectionWordCount(updated.content),
                }
              }),
            },
            citations,
          }))
        })()
      }
    },
    [subscriptionTier, recordHistory],
  )

  const updateWordLimit = useCallback(
    (patch: Partial<EssayBlueprint['wordLimit']>) => {
      recordHistory()
      const planMax = PLAN_WORD_LIMITS[subscriptionTier]
      setEssay((e) => {
        const next = { ...e.blueprint.wordLimit, ...patch }
        if (next.minAuto || next.maxAuto) {
          const auto = computeAutoWordLimit({
            instructionsText: e.blueprint.instructionsText,
            documentType: e.blueprint.documentType,
            planMax,
            minAuto: next.minAuto,
            maxAuto: next.maxAuto,
          })
          if (next.minAuto) next.min = auto.min
          if (next.maxAuto) next.max = auto.max
        }
        if (!next.maxAuto) {
          next.max = Math.min(next.max || planMax, planMax)
        }
        if (!next.minAuto && !next.maxAuto && patch.minAuto === false && patch.maxAuto === false) {
          if (patch.max === undefined) next.max = planMax
          if (patch.min === undefined) next.min = Math.round(planMax * 0.9)
        }
        const synced = syncBlueprintResolvedFields(
          { ...e.blueprint, wordLimit: next },
          subscriptionTier,
        )
        return {
          ...e,
          blueprint: {
            ...synced,
            wordBudget: synced.frameworkGenerated
              ? { ...e.blueprint.wordBudget, total: synced.wordLimit.max }
              : synced.wordBudget,
          },
        }
      })
    },
    [subscriptionTier, recordHistory],
  )

  const updateWordBudgetSection = useCallback(
    (sectionId: string, patch: { label?: string; weightPercent?: number }) => {
      recordHistory()
      setEssay((e) => {
        const total = e.blueprint.wordBudget.total
        const sections = e.blueprint.wordBudget.sections.map((s) => {
          if (s.id !== sectionId) return s
          const next = { ...s, ...patch }
          if (patch.weightPercent != null) {
            next.targetWords = Math.round((total * next.weightPercent) / 100)
          }
          return next
        })
        return {
          ...e,
          blueprint: {
            ...e.blueprint,
            wordBudget: { ...e.blueprint.wordBudget, sections },
          },
        }
      })
    },
    [recordHistory],
  )

  const updateAnalysis = useCallback(
    (patch: Partial<BlueprintAnalysis>) => {
      recordHistory()
      setEssay((e) => ({
        ...e,
        blueprint: {
          ...e.blueprint,
          analysis: e.blueprint.analysis
            ? { ...e.blueprint.analysis, ...patch }
            : null,
        },
      }))
    },
    [recordHistory],
  )

  const rebalanceWordBudget = useCallback(() => {
    recordHistory()
    setEssay((e) => {
      const target = e.blueprint.wordBudget.total
      const sections = rebalanceWordBudgetSections(e.blueprint.wordBudget.sections, target)
      return {
        ...e,
        blueprint: {
          ...e.blueprint,
          wordBudget: { total: target, sections },
        },
      }
    })
  }, [recordHistory])

  const resetWordBudgetToTemplate = useCallback(() => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      blueprint: {
        ...e.blueprint,
        wordBudget: applyWordBudgetTemplate(
          e.blueprint.documentType,
          e.blueprint.wordLimit.max,
        ),
      },
    }))
  }, [recordHistory])

  const reorderWordBudgetSections = useCallback((orderedIds: string[]) => {
    recordHistory()
    setEssay((e) => {
      const byId = new Map(e.blueprint.wordBudget.sections.map((s) => [s.id, s]))
      const sections = orderedIds
        .map((id) => byId.get(id))
        .filter((s): s is NonNullable<typeof s> => s != null)
      if (sections.length !== e.blueprint.wordBudget.sections.length) return e
      return {
        ...e,
        blueprint: {
          ...e.blueprint,
          wordBudget: { ...e.blueprint.wordBudget, sections },
        },
      }
    })
  }, [recordHistory])

  const removeWordBudgetSection = useCallback((sectionId: string) => {
    recordHistory()
    setEssay((e) => {
      if (e.blueprint.wordBudget.sections.length <= 1) return e
      return {
        ...e,
        blueprint: {
          ...e.blueprint,
          wordBudget: {
            ...e.blueprint.wordBudget,
            sections: e.blueprint.wordBudget.sections.filter((s) => s.id !== sectionId),
          },
        },
      }
    })
  }, [recordHistory])

  const addWordBudgetSection = useCallback(() => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      blueprint: {
        ...e.blueprint,
        wordBudget: {
          ...e.blueprint.wordBudget,
          sections: [
            ...e.blueprint.wordBudget.sections,
            {
              id: `sec-custom-${Date.now()}`,
              label: '',
              weightPercent: 10,
              targetWords: Math.round(e.blueprint.wordBudget.total * 0.1),
            },
          ],
        },
      },
    }))
  }, [recordHistory])

  const generateFramework = useCallback(async () => {
    recordHistory()
    setAnalyzing(true)
    try {
      let snapshot: EssayBlueprint = essay.blueprint
      setEssay((e) => {
        snapshot = syncBlueprintResolvedFields(e.blueprint, subscriptionTier)
        return { ...e, blueprint: snapshot }
      })
      let analysis: EssayBlueprint['analysis']
      let proposals: Partial<EssayBlueprint>
      try {
        const res = await fetch('/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueprint: snapshot }),
        })
        if (await handleQuotaResponse(res)) return
        if (res.ok) {
          const data = await res.json()
          analysis = data.analysis
          proposals = data.proposals
        } else {
          throw new Error('API failed')
        }
      } catch {
        const stub = await analyzeInstructions(snapshot)
        analysis = stub.analysis
        proposals = stub.proposals
      }
      setEssay((e) => {
        const synced = syncBlueprintResolvedFields(
          {
            ...e.blueprint,
            ...proposals,
            analysis,
            frameworkGenerated: true,
          },
          subscriptionTier,
        )
        return {
          ...e,
          blueprint: {
            ...synced,
            frameworkInputFingerprint: blueprintInputFingerprint(synced),
          },
        }
      })
    } finally {
      setAnalyzing(false)
    }
  }, [essay.blueprint, subscriptionTier, recordHistory])

  const runAnalyzeBlueprint = generateFramework

  const fetchOutlineNodes = useCallback(
    async (snapshot: EssayBlueprint, fallback: OutlineNode[]): Promise<OutlineNode[]> => {
      try {
        const res = await fetch('/api/ai/outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueprint: snapshot }),
        })
        if (await handleQuotaResponse(res)) return fallback
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.nodes) && data.nodes.length > 0) return data.nodes
        }
        throw new Error('Outline API failed')
      } catch {
        return snapshot.wordBudget.sections.length > 0
          ? mockOutlineFromBlueprint(snapshot)
          : fallback
      }
    },
    [handleQuotaResponse],
  )

  const applyOutlineNodes = useCallback(
    (
      nodes: OutlineNode[],
      snapshot: EssayBlueprint,
      navigateToOutline: boolean,
      extraSources?: SourceRecord[],
    ) => {
      const sections = createDraftSectionsFromBudget(snapshot.wordBudget)
      setEssay((e) => {
        const mergedSources = [...e.sources]
        if (extraSources?.length) {
          for (const source of extraSources) {
            if (
              !mergedSources.some(
                (s) =>
                  (source.url && s.url === source.url) ||
                  (!source.url && s.title === source.title),
              )
            ) {
              mergedSources.push(source)
            }
          }
        }
        return {
          ...e,
          blueprint: {
            ...e.blueprint,
            approvedAt: e.blueprint.approvedAt ?? Date.now(),
            outlineBudgetFingerprint: wordBudgetSnapshotJson(snapshot.wordBudget),
          },
          sources: mergedSources,
          outline: { ...e.outline, nodes },
          draft: {
            sections,
            activeSectionId: sections[0]?.id ?? null,
            generatedAt: e.draft.generatedAt,
            tools: {},
            showInlineHighlights: e.draft.showInlineHighlights ?? true,
          },
          workspaceContext: {
            ...e.workspaceContext,
            activeSectionId: sections[0]?.id ?? null,
          },
        }
      })
      if (navigateToOutline) navigateApp('outline')
    },
    [navigateApp],
  )

  const generateOutline = useCallback(async () => {
    recordHistory()
    setGeneratingOutline(true)
    try {
      const snapshot = syncBlueprintResolvedFields(essay.blueprint, subscriptionTier)
      const isFirstGeneration = essay.blueprint.approvedAt == null
      let nodes = await fetchOutlineNodes(snapshot, essay.outline.nodes)
      let extraSources: SourceRecord[] | undefined
      if (isFirstGeneration) {
        const enriched = await attachInitialSourcesToOutline(nodes, {
          thesis: snapshot.thesis,
        })
        nodes = enriched.nodes
        extraSources = enriched.sources
      }
      applyOutlineNodes(nodes, snapshot, true, extraSources)
    } finally {
      setGeneratingOutline(false)
    }
  }, [
    essay.blueprint,
    essay.outline.nodes,
    subscriptionTier,
    recordHistory,
    fetchOutlineNodes,
    applyOutlineNodes,
  ])

  const updateOutline = useCallback(async () => {
    recordHistory()
    setGeneratingOutline(true)
    try {
      const snapshot = syncBlueprintResolvedFields(essay.blueprint, subscriptionTier)
      const merged = mergeOutlineWithBudget(essay.outline.nodes, snapshot)
      applyOutlineNodes(merged, snapshot, true)
    } finally {
      setGeneratingOutline(false)
    }
  }, [essay.blueprint, essay.outline.nodes, subscriptionTier, recordHistory, applyOutlineNodes])

  const regenerateOutline = useCallback(async () => {
    recordHistory()
    setGeneratingOutline(true)
    try {
      const snapshot = syncBlueprintResolvedFields(essay.blueprint, subscriptionTier)
      const nodes = await fetchOutlineNodes(snapshot, essay.outline.nodes)
      applyOutlineNodes(nodes, snapshot, false)
    } finally {
      setGeneratingOutline(false)
    }
  }, [
    essay.blueprint,
    essay.outline.nodes,
    subscriptionTier,
    recordHistory,
    fetchOutlineNodes,
    applyOutlineNodes,
  ])

  const approveBlueprint = generateOutline

  const completeInstructions = generateOutline

  const setOutlineNodes = useCallback((nodes: OutlineNode[]) => {
    setEssay((e) => ({ ...e, outline: { ...e.outline, nodes } }))
  }, [])

  const toggleOutlineCollapse = useCallback((nodeId: string) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: {
        ...e.outline,
        nodes: e.outline.nodes.map((n) =>
          n.id === nodeId ? { ...n, collapsed: !n.collapsed } : n,
        ),
      },
    }))
  }, [recordHistory])

  const selectOutlineNode = useCallback((nodeId: string | null) => {
    setEssay((e) => ({
      ...e,
      workspaceContext: {
        ...e.workspaceContext,
        selectedOutlineNodeId: nodeId,
        selectedSourceId: null,
      },
    }))
  }, [])

  const selectSource = useCallback((sourceId: string | null) => {
    setEssay((e) => ({
      ...e,
      workspaceContext: { ...e.workspaceContext, selectedSourceId: sourceId },
    }))
  }, [])

  const updateOutlineNode = useCallback((nodeId: string, patch: Partial<OutlineNode>) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: {
        ...e.outline,
        nodes: e.outline.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
      },
    }))
  }, [recordHistory])

  const reorderOutlineNodes = useCallback((orderedIds: string[]) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: {
        ...e.outline,
        nodes: e.outline.nodes.map((n) => {
          const order = orderedIds.indexOf(n.id)
          return order >= 0 ? { ...n, order } : n
        }),
      },
    }))
  }, [recordHistory])

  const getDescendantIds = useCallback((nodes: OutlineNode[], rootId: string): Set<string> => {
    const ids = new Set<string>([rootId])
    let changed = true
    while (changed) {
      changed = false
      for (const node of nodes) {
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id)
          changed = true
        }
      }
    }
    return ids
  }, [])

  const addOutlineNode = useCallback(
    (parentId: string | null, type: OutlineNodeType, title = ''): string => {
      recordHistory()
      const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setEssay((e) => {
        const siblings = e.outline.nodes.filter((n) => n.parentId === parentId)
        const order = siblings.length
        return {
          ...e,
          outline: {
            ...e.outline,
            nodes: [
              ...e.outline.nodes,
              {
                id,
                parentId,
                type,
                title,
                sourceRefs: [],
                collapsed: false,
                order,
              },
            ],
          },
          workspaceContext: {
            ...e.workspaceContext,
            selectedOutlineNodeId: id,
            selectedSourceId: null,
          },
        }
      })
      return id
    },
    [recordHistory],
  )

  const normalizeOutlineOrders = useCallback((nodes: OutlineNode[]): OutlineNode[] => {
    const byParent = new Map<string | null, OutlineNode[]>()
    for (const node of nodes) {
      const list = byParent.get(node.parentId) ?? []
      list.push(node)
      byParent.set(node.parentId, list)
    }
    const next: OutlineNode[] = []
    for (const siblings of byParent.values()) {
      siblings.sort((a, b) => a.order - b.order)
      siblings.forEach((sibling, index) => next.push({ ...sibling, order: index }))
    }
    return next
  }, [])

  const convertOutlineNodeType = useCallback(
    (nodeId: string) => {
      recordHistory()
      setEssay((e) => {
        const node = e.outline.nodes.find((n) => n.id === nodeId)
        if (!node || node.type === 'section') return e

        let updated = [...e.outline.nodes]

        if (node.type === 'subpoint') {
          const parentPoint = updated.find((n) => n.id === node.parentId)
          if (!parentPoint?.parentId) return e
          const sectionId = parentPoint.parentId
          const insertOrder = parentPoint.order + 1
          updated = updated
            .filter((n) => n.id !== nodeId)
            .map((n) => {
              if (n.parentId === sectionId && n.type === 'point' && n.order >= insertOrder) {
                return { ...n, order: n.order + 1 }
              }
              return n
            })
          updated.push({
            ...node,
            type: 'point',
            parentId: sectionId,
            order: insertOrder,
          })
        } else {
          const hasSubpoints = updated.some((n) => n.parentId === nodeId)
          if (hasSubpoints) return e
          const sectionSiblings = updated
            .filter((n) => n.parentId === node.parentId && n.type === 'point')
            .sort((a, b) => a.order - b.order)
          const idx = sectionSiblings.findIndex((n) => n.id === nodeId)
          const targetPoint = sectionSiblings[idx - 1] ?? sectionSiblings[idx + 1]
          if (!targetPoint) return e
          const subCount = updated.filter((n) => n.parentId === targetPoint.id).length
          updated = updated.filter((n) => n.id !== nodeId)
          updated.push({
            ...node,
            type: 'subpoint',
            parentId: targetPoint.id,
            order: subCount,
          })
        }

        return {
          ...e,
          outline: { ...e.outline, nodes: normalizeOutlineOrders(updated) },
        }
      })
    },
    [recordHistory, normalizeOutlineOrders],
  )

  const removeOutlineNode = useCallback(
    (nodeId: string) => {
      recordHistory()
      setEssay((e) => {
        const toRemove = getDescendantIds(e.outline.nodes, nodeId)
        const remaining = e.outline.nodes.filter((n) => !toRemove.has(n.id))
        const byParent = new Map<string | null, OutlineNode[]>()
        for (const node of remaining) {
          const list = byParent.get(node.parentId) ?? []
          list.push(node)
          byParent.set(node.parentId, list)
        }
        const normalized = remaining.map((node) => {
          const siblings = (byParent.get(node.parentId) ?? []).sort((a, b) => a.order - b.order)
          const order = siblings.findIndex((s) => s.id === node.id)
          return order >= 0 ? { ...node, order } : node
        })
        const selectedId = e.workspaceContext.selectedOutlineNodeId
        const nextSelected =
          selectedId && toRemove.has(selectedId)
            ? remaining.find((n) => n.parentId === null)?.id ?? null
            : selectedId
        return {
          ...e,
          outline: { ...e.outline, nodes: normalized },
          workspaceContext: {
            ...e.workspaceContext,
            selectedOutlineNodeId: nextSelected,
            selectedSourceId: null,
          },
        }
      })
    },
    [getDescendantIds, recordHistory],
  )

  const moveOutlineNode = useCallback(
    (nodeId: string, newParentId: string | null, newOrder: number) => {
      recordHistory()
      setEssay((e) => {
        const node = e.outline.nodes.find((n) => n.id === nodeId)
        if (!node) return e
        if (newParentId === nodeId) return e
        if (newParentId) {
          const descendants = getDescendantIds(e.outline.nodes, nodeId)
          if (descendants.has(newParentId)) return e
          const parent = e.outline.nodes.find((n) => n.id === newParentId)
          if (!parent) return e
          if (node.type === 'section') return e
        } else if (node.type !== 'section') {
          return e
        }

        const remaining = e.outline.nodes.filter((n) => n.id !== nodeId)
        const byParent = new Map<string | null, OutlineNode[]>()
        for (const n of remaining) {
          const list = byParent.get(n.parentId) ?? []
          list.push(n)
          byParent.set(n.parentId, list)
        }

        const parentNode = newParentId
          ? remaining.find((n) => n.id === newParentId)
          : null
        const nextType: OutlineNodeType = !newParentId
          ? 'section'
          : parentNode?.type === 'section'
            ? 'point'
            : 'subpoint'
        const targetSiblings = (byParent.get(newParentId) ?? []).sort((a, b) => a.order - b.order)
        const clampedOrder = Math.max(0, Math.min(newOrder, targetSiblings.length))
        targetSiblings.splice(clampedOrder, 0, {
          ...node,
          parentId: newParentId,
          type: nextType,
        })
        byParent.set(newParentId, targetSiblings)

        const nextNodes: OutlineNode[] = []
        for (const [parentId, siblings] of byParent) {
          // The target parent's list is already in the desired visual order from the
          // splice above; re-sorting it by the stale `order` field would revert the move.
          const ordered =
            parentId === newParentId ? siblings : [...siblings].sort((a, b) => a.order - b.order)
          ordered.forEach((sibling, index) => {
            nextNodes.push({ ...sibling, parentId, order: index })
          })
        }

        return {
          ...e,
          outline: { ...e.outline, nodes: nextNodes },
        }
      })
    },
    [getDescendantIds, recordHistory],
  )

  const toggleAllOutlineCollapse = useCallback((collapsed: boolean) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: {
        ...e.outline,
        nodes: e.outline.nodes.map((n) => {
          const hasChildren = e.outline.nodes.some((c) => c.parentId === n.id)
          return hasChildren ? { ...n, collapsed } : n
        }),
      },
    }))
  }, [recordHistory])

  const expandAllOutline = useCallback(() => toggleAllOutlineCollapse(false), [toggleAllOutlineCollapse])
  const collapseAllOutline = useCallback(() => toggleAllOutlineCollapse(true), [toggleAllOutlineCollapse])

  const addSource = useCallback((source: Omit<SourceRecord, 'id'>) => {
    const id = `src-${Date.now()}`
    setEssay((e) => ({
      ...e,
      sources: [
        ...e.sources,
        {
          ...source,
          id,
          enrichment: { status: 'pending' as const },
        },
      ],
    }))
    return id
  }, [])

  const attachSourceToNode = useCallback(
    (nodeId: string, sourceId: string, quote?: string) => {
      recordHistory()
      setEssay((e) => {
        const node = e.outline.nodes.find((n) => n.id === nodeId)
        if (!node || node.type !== 'subpoint') return e
        return {
          ...e,
          outline: {
            ...e.outline,
            nodes: e.outline.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    sourceRefs: n.sourceRefs.some((r) => r.sourceId === sourceId)
                      ? n.sourceRefs
                      : [
                          ...n.sourceRefs,
                          quote
                            ? { sourceId, quote, quotes: [quote] }
                            : { sourceId },
                        ],
                  }
                : n,
            ),
          },
        }
      })
    },
    [recordHistory],
  )

  const detachSourceFromNode = useCallback((nodeId: string, sourceId: string) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: {
        ...e.outline,
        nodes: e.outline.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                sourceRefs: n.sourceRefs.filter((r) => r.sourceId !== sourceId),
              }
            : n,
        ),
      },
      workspaceContext: {
        ...e.workspaceContext,
        selectedSourceId:
          e.workspaceContext.selectedSourceId === sourceId
            ? null
            : e.workspaceContext.selectedSourceId,
      },
    }))
  }, [recordHistory])

  const updateSource = useCallback((sourceId: string, patch: Partial<SourceRecord>) => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      sources: e.sources.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)),
    }))
  }, [recordHistory])

  const enrichSource = useCallback(
    async (sourceId: string) => {
      const source = essayRef.current.sources.find((s) => s.id === sourceId)
      if (!source) return

      setEnrichingIds((prev) => new Set(prev).add(sourceId))
      setEssay((e) => ({
        ...e,
        sources: e.sources.map((s) =>
          s.id === sourceId ? { ...s, enrichment: { status: 'enriching' as const } } : s,
        ),
      }))

      try {
        const res = await fetch('/api/sources/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source }),
        })
        if (await handleQuotaResponse(res)) return
        if (res.ok) {
          const data = (await res.json()) as { patch: Partial<SourceRecord> }
          setEssay((e) => ({
            ...e,
            sources: e.sources.map((s) =>
              s.id === sourceId ? { ...s, ...data.patch } : s,
            ),
          }))
        } else {
          updateSource(sourceId, {
            enrichment: { status: 'failed', error: 'Enrichment request failed' },
          })
        }
      } catch {
        updateSource(sourceId, {
          enrichment: { status: 'failed', error: 'Enrichment request failed' },
        })
      } finally {
        setEnrichingIds((prev) => {
          const next = new Set(prev)
          next.delete(sourceId)
          return next
        })
      }
    },
    [updateSource],
  )

  const evaluateSource = useCallback(
    async (sourceId: string) => {
      const source = essayRef.current.sources.find((s) => s.id === sourceId)
      if (!source) return

      setEvaluatingIds((prev) => new Set(prev).add(sourceId))
      try {
        const res = await fetch('/api/sources/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, useLlm: true }),
        })
        if (await handleQuotaResponse(res)) return
        if (res.ok) {
          const data = (await res.json()) as { reliability: SourceReliability }
          updateSource(sourceId, { reliability: data.reliability })
        }
      } finally {
        setEvaluatingIds((prev) => {
          const next = new Set(prev)
          next.delete(sourceId)
          return next
        })
      }
    },
    [updateSource],
  )

  const enrichAllSources = useCallback(async () => {
    const ids = essayRef.current.sources.map((s) => s.id)
    if (ids.length === 0) return
    setBulkEnriching(true)
    for (const id of ids) {
      await enrichSource(id)
    }
    setBulkEnriching(false)
  }, [enrichSource])

  const evaluateAllSources = useCallback(async () => {
    const ids = essayRef.current.sources.map((s) => s.id)
    if (ids.length === 0) return
    setBulkEvaluating(true)
    for (const id of ids) {
      await evaluateSource(id)
    }
    setBulkEvaluating(false)
  }, [evaluateSource])

  const removeSource = useCallback(
    (sourceId: string) => {
      recordHistory()
      setEssay((e) => ({
        ...e,
        sources: e.sources.filter((s) => s.id !== sourceId),
        citations: e.citations.filter((c) => c.sourceId !== sourceId),
        outline: {
          ...e.outline,
          nodes: e.outline.nodes.map((n) => ({
            ...n,
            sourceRefs: n.sourceRefs.filter((r) => r.sourceId !== sourceId),
          })),
        },
        workspaceContext: {
          ...e.workspaceContext,
          selectedSourceId:
            e.workspaceContext.selectedSourceId === sourceId
              ? null
              : e.workspaceContext.selectedSourceId,
        },
      }))
    },
    [recordHistory],
  )

  const updateSourceRefQuotes = useCallback(
    (nodeId: string, sourceId: string, quotes: string[]) => {
      recordHistory()
      const nonEmpty = quotes.filter((q) => q.trim())
      const legacyQuote = nonEmpty.length > 0 ? nonEmpty.join('\n\n') : undefined
      const nextQuotes = quotes.length > 0 ? quotes : undefined
      setEssay((e) => ({
        ...e,
        outline: {
          ...e.outline,
          nodes: e.outline.nodes.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  sourceRefs: n.sourceRefs.map((r) =>
                    r.sourceId === sourceId
                      ? {
                          ...r,
                          quote: legacyQuote,
                          quotes: nextQuotes,
                        }
                      : r,
                  ),
                }
              : n,
          ),
        },
      }))
    },
    [recordHistory],
  )

  const updateSourceRefQuote = useCallback(
    (nodeId: string, sourceId: string, quote: string) => {
      updateSourceRefQuotes(nodeId, sourceId, quote ? [quote] : [])
    },
    [updateSourceRefQuotes],
  )

  const markOutlineReadyForDraft = useCallback(() => {
    recordHistory()
    setEssay((e) => ({
      ...e,
      outline: { ...e.outline, readyForDraftAt: Date.now() },
    }))
    navigateApp('draft')
  }, [navigateApp, recordHistory])

  const setDraftMode = useCallback((mode: DraftMode) => {
    setEssay((e) => ({
      ...e,
      workspaceContext: { ...e.workspaceContext, draftMode: mode },
    }))
  }, [])

  const setActiveDraftSection = useCallback((sectionId: string) => {
    setEssay((e) => ({
      ...e,
      draft: { ...e.draft, activeSectionId: sectionId },
      workspaceContext: { ...e.workspaceContext, activeSectionId: sectionId },
    }))
  }, [])

  const updateDraftSectionContent = useCallback(
    (sectionId: string, html: string, content: string) => {
      recordHistory()
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          sections: e.draft.sections.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  html,
                  content,
                  wordCount: recalcSectionWordCount(content),
                  status: content.trim() ? 'draft' : 'empty',
                }
              : s,
          ),
        },
      }))
    },
    [recordHistory],
  )

  const updateUnifiedDraft = useCallback(
    (sections: Array<{ id: string; label: string; html: string; content: string }>) => {
      recordHistory()
      setEssay((e) => {
        const reconciled = reconcileDraftSections(
          sections,
          e.sources,
          e.blueprint.referencingStyleId,
        )
        return {
          ...e,
          draft: {
            ...e.draft,
            sections: e.draft.sections.map((s) => {
              const updated = reconciled.sections.find((u) => u.id === s.id)
              if (!updated) return s
              const content = updated.content
              return {
                ...s,
                label: updated.label,
                html: updated.html,
                content,
                wordCount: recalcSectionWordCount(content),
                status: content.trim() ? ('draft' as const) : ('empty' as const),
              }
            }),
          },
          citations: reconciled.citations,
        }
      })
      scheduleFormatDraftCitations()
    },
    [recordHistory, scheduleFormatDraftCitations],
  )

  const regenerateFrameworkField = useCallback(
    async (field: 'title' | 'researchQuestion' | 'thesis') => {
      recordHistory()
      const snapshot = essayRef.current.blueprint
      try {
        const res = await fetch('/api/ai/framework/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field, blueprint: snapshot }),
        })
        if (await handleQuotaResponse(res)) return
        if (res.ok) {
          const data = (await res.json()) as { value: string }
          setEssay((e) => ({
            ...e,
            blueprint: { ...e.blueprint, [field]: data.value },
          }))
        }
      } catch {
        // keep current value on failure
      }
    },
    [recordHistory],
  )

  const setDraftSectionHighlights = useCallback((sectionId: string, highlights: string[]) => {
    setEssay((e) => ({
      ...e,
      draft: {
        ...e.draft,
        sections: e.draft.sections.map((s) =>
          s.id === sectionId ? { ...s, highlights } : s,
        ),
      },
    }))
  }, [])

  const applyGeneratedSection = useCallback(
    async (sectionId: string, content: string, html: string) => {
      const current = essayRef.current
      const styleId = current.blueprint.referencingStyleId
      const nextHtml = await convertCitationTokensInHtml(html, current.sources, styleId)
      const nextContent = await convertCitationTokensInPlain(content, current.sources, styleId)
      const result = await formatDraftCitationsAsync(
        current.draft.sections.map((s) =>
          s.id === sectionId ? { ...s, html: nextHtml, content: nextContent } : s,
        ),
        current.sources,
        styleId,
      )
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          generatedAt: e.draft.generatedAt ?? Date.now(),
          sections: e.draft.sections.map((s) => {
            const updated = result.sections.find((u) => u.id === s.id)
            if (!updated) return s
            return {
              ...s,
              content: updated.content,
              html: updated.html,
              wordCount: recalcSectionWordCount(updated.content),
              status: 'draft' as const,
            }
          }),
        },
        citations: result.citations,
      }))
    },
    [],
  )

  const generateDraftSection = useCallback(
    async (sectionId: string) => {
      const current = essayRef.current
      const section = current.draft.sections.find((s) => s.id === sectionId)
      if (!section) return
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          sections: e.draft.sections.map((s) =>
            s.id === sectionId ? { ...s, status: 'generating' } : s,
          ),
        },
      }))
      let content: string
      let html: string
      try {
        const res = await fetch('/api/ai/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId,
            sectionLabel: section.label,
            blueprint: current.blueprint,
            outline: current.outline,
            sources: current.sources,
          }),
        })
        if (await handleQuotaResponse(res)) {
          content = await generateDraftSectionStub(section.label, current.blueprint)
          html = contentToHtml(content)
        } else if (res.ok) {
          const data = (await res.json()) as { content: string; html?: string }
          content = data.content
          html = data.html ?? contentToHtml(data.content)
        } else {
          content = await generateDraftSectionStub(section.label, current.blueprint)
          html = contentToHtml(content)
        }
      } catch {
        content = await generateDraftSectionStub(section.label, current.blueprint)
        html = contentToHtml(content)
      }
      applyGeneratedSection(sectionId, content, html)
    },
    [applyGeneratedSection],
  )

  const generateFullDraft = useCallback(async () => {
    const current = essayRef.current
    setGeneratingFullDraft(true)
    for (const section of current.draft.sections) {
      await generateDraftSection(section.id)
    }
    setGeneratingFullDraft(false)
  }, [generateDraftSection])

  const generateDraftFromOutline = useCallback(async () => {
    recordHistory()
    const current = essayRef.current
    const isRegenerate =
      current.draft.generatedAt != null ||
      current.draft.sections.some((s) => s.content.trim().length > 0)

    setEssay((e) => ({
      ...e,
      outline: { ...e.outline, readyForDraftAt: Date.now() },
      draft: isRegenerate
        ? {
            ...e.draft,
            sections: e.draft.sections.map((s) => ({
              ...s,
              content: '',
              html: '',
              wordCount: 0,
              status: 'generating' as const,
            })),
            tools: {},
          }
        : e.draft,
    }))
    navigateApp('draft')
    setGeneratingFullDraft(true)
    const sections = essayRef.current.draft.sections
    for (const section of sections) {
      await generateDraftSection(section.id)
    }
    setGeneratingFullDraft(false)
  }, [navigateApp, recordHistory, generateDraftSection])

  const setDraftToolScope = useCallback((tool: DraftToolKind, scope: DraftToolScope) => {
    setDraftToolScopes((prev) => ({ ...prev, [tool]: scope }))
  }, [])

  const runDraftTool = useCallback(
    async (tool: DraftToolKind, options?: RunDraftToolOptions) => {
      const current = essayRef.current
      const toolDef = getDraftToolDef(tool)
      const scope =
        toolDef.runMode === 'essay' ? 'essay' : (draftToolScopes[tool] ?? getDefaultToolScope(tool))
      const sectionId =
        options?.selection?.sectionId ??
        current.workspaceContext.selectedTextRange?.sectionId ??
        current.draft.activeSectionId ??
        current.draft.sections[0]?.id ??
        null
      const selectedText =
        options?.selection?.text ?? current.workspaceContext.selectedTextRange?.text

      if (toolDef.runMode === 'selection' && !selectedText?.trim()) {
        return
      }

      if (isSelectionTool(tool)) {
        setEssay((e) => ({
          ...e,
          workspaceContext: { ...e.workspaceContext, activeSelectionTool: tool },
        }))
      }

      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          tools: {
            ...e.draft.tools,
            [tool]: {
              ...(e.draft.tools?.[tool] ?? createEmptyToolState()),
              status: 'running',
            },
          },
        },
      }))

      let suggestions: DraftSuggestion[] = []
      try {
        const res = await fetch('/api/ai/draft/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool,
            scope,
            sectionId: scope === 'section' ? sectionId : undefined,
            blueprint: current.blueprint,
            sections: current.draft.sections.map((s) => ({
              id: s.id,
              label: s.label,
              content: s.content,
            })),
            selectedText,
            targetWritingStyle: options?.targetWritingStyle,
          }),
        })
        if (await handleQuotaResponse(res)) return
        if (res.ok) {
          const data = (await res.json()) as { suggestions: DraftSuggestion[] }
          suggestions = data.suggestions
        } else {
          suggestions = await runDraftToolStub(
            tool,
            current.draft.sections,
            sectionId ?? 'section-1',
            current.blueprint,
            selectedText,
            options?.targetWritingStyle,
          )
        }
      } catch {
        suggestions = await runDraftToolStub(
          tool,
          current.draft.sections,
          sectionId ?? 'section-1',
          current.blueprint,
          selectedText,
          options?.targetWritingStyle,
        )
      }

      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          tools: {
            ...e.draft.tools,
            [tool]: {
              status: 'done',
              lastRunAt: Date.now(),
              results: suggestions,
            },
          },
        },
      }))
    },
    [draftToolScopes],
  )

  const runAllDraftTools = useCallback(
    async (category?: DraftToolCategory) => {
      if (category === 'editing') {
        for (const kind of ['spelling', 'writingQuality'] as const) {
          await runDraftTool(kind)
        }
        return
      }
      const tools = category
        ? getDraftToolsByCategory(category)
        : DRAFT_TOOL_DEFS.filter((d) => d.runMode === 'essay')
      for (const { kind } of tools) {
        await runDraftTool(kind)
      }
    },
    [runDraftTool],
  )

  const clearMultipurposeToolResults = useCallback(() => {
    const kinds: DraftToolKind[] = [
      'shiftTone',
      'elevatePhrasing',
      'findSynonyms',
      'definePhrase',
    ]
    setEssay((e) => {
      const tools = { ...(e.draft.tools ?? {}) }
      for (const kind of kinds) {
        const state = tools[kind]
        if (!state) continue
        tools[kind] = { ...state, results: [], status: 'idle' }
      }
      return {
        ...e,
        draft: { ...e.draft, tools },
        workspaceContext: { ...e.workspaceContext, activeSelectionTool: null },
      }
    })
  }, [])

  const findSuggestionById = useCallback(
    (suggestionId: string): DraftSuggestion | null => {
      const tools = essayRef.current.draft.tools ?? {}
      for (const state of Object.values(tools)) {
        const found = state?.results.find((s) => s.id === suggestionId)
        if (found) return found
      }
      return null
    },
    [],
  )

  const updateSuggestionStatus = useCallback(
    (suggestionId: string, status: DraftSuggestion['status']) => {
      setEssay((e) => {
        const tools = { ...e.draft.tools }
        for (const key of Object.keys(tools) as DraftToolKind[]) {
          const state = tools[key]
          if (!state) continue
          tools[key] = {
            ...state,
            results: state.results.map((s) =>
              s.id === suggestionId ? { ...s, status } : s,
            ),
          }
        }
        return { ...e, draft: { ...e.draft, tools } }
      })
    },
    [],
  )

  const applyTextToSection = useCallback(
    (sectionId: string, targetText: string, replacement: string) => {
      recordHistory()
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          sections: e.draft.sections.map((s) => {
            if (s.id !== sectionId) return s
            const content = s.content.includes(targetText)
              ? s.content.replace(targetText, replacement)
              : s.content
            const html = s.html.includes(targetText)
              ? s.html.replace(targetText, replacement)
              : contentToHtml(content)
            return {
              ...s,
              content,
              html,
              wordCount: recalcSectionWordCount(content),
              status: content.trim() ? 'draft' : 'empty',
            }
          }),
        },
      }))
    },
    [recordHistory],
  )

  const acceptDraftSuggestion = useCallback(
    (suggestionId: string) => {
      const suggestion = findSuggestionById(suggestionId)
      if (!suggestion?.suggestion || !suggestion.targetText) {
        updateSuggestionStatus(suggestionId, 'accepted')
        return
      }
      applyTextToSection(suggestion.sectionId, suggestion.targetText, suggestion.suggestion)
      updateSuggestionStatus(suggestionId, 'accepted')
    },
    [applyTextToSection, findSuggestionById, updateSuggestionStatus],
  )

  const dismissDraftSuggestion = useCallback(
    (suggestionId: string) => {
      updateSuggestionStatus(suggestionId, 'dismissed')
      if (highlightedSuggestionId === suggestionId) {
        setHighlightedSuggestionId(null)
      }
    },
    [highlightedSuggestionId, updateSuggestionStatus],
  )

  const replaceDraftSuggestion = useCallback(
    (suggestionId: string, text: string) => {
      const suggestion = findSuggestionById(suggestionId)
      if (!suggestion?.targetText) {
        updateSuggestionStatus(suggestionId, 'accepted')
        return
      }
      applyTextToSection(suggestion.sectionId, suggestion.targetText, text)
      updateSuggestionStatus(suggestionId, 'accepted')
    },
    [applyTextToSection, findSuggestionById, updateSuggestionStatus],
  )

  const acceptAllDraftTool = useCallback(
    (tool: DraftToolKind) => {
      const state = essayRef.current.draft.tools?.[tool]
      if (!state) return
      for (const s of state.results) {
        if (s.status === 'open' && s.suggestion && s.targetText) {
          applyTextToSection(s.sectionId, s.targetText, s.suggestion)
        }
      }
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          tools: {
            ...e.draft.tools,
            [tool]: {
              ...state,
              results: state.results.map((s) =>
                s.status === 'open' ? { ...s, status: 'accepted' as const } : s,
              ),
            },
          },
        },
      }))
    },
    [applyTextToSection],
  )

  const dismissAllDraftTool = useCallback((tool: DraftToolKind) => {
    setEssay((e) => {
      const state = e.draft.tools?.[tool]
      if (!state) return e
      return {
        ...e,
        draft: {
          ...e.draft,
          tools: {
            ...e.draft.tools,
            [tool]: {
              ...state,
              results: state.results.map((s) =>
                s.status === 'open' ? { ...s, status: 'dismissed' as const } : s,
              ),
            },
          },
        },
      }
    })
  }, [])

  const insertCitationAt = useCallback(
    (sectionId: string, sourceId: string) => {
      void (async () => {
        const current = essayRef.current
        const source = current.sources.find((s) => s.id === sourceId)
        if (!source) return
        const styleId = current.blueprint.referencingStyleId
        const priorSpans = extractAllCitationSpans(current.draft.sections)
        const inText = await formatInTextCitation(source, styleId, current.sources, {
          priorSourceIds: priorSpans.map((s) => s.sourceId),
        })
        const citationId = `cite-${Date.now()}`
        const span = buildCitationSpanHtml({
          citationId,
          sourceId,
          inText,
          sectionId,
        })
        recordHistory()
        setEssay((e) => {
          const nextSections = e.draft.sections.map((s) => {
            if (s.id !== sectionId) return s
            const content = s.content.trim() ? `${s.content} ${inText}` : inText
            const html = s.html.trim()
              ? s.html.replace(/<\/p>\s*$/i, ` ${span}</p>`) || `${s.html} ${span}`
              : `<p>${span}</p>`
            return {
              ...s,
              content,
              html,
              wordCount: recalcSectionWordCount(content),
              status: 'draft' as const,
            }
          })
          const reconciled = reconcileDraftSections(nextSections, e.sources, styleId)
          return {
            ...e,
            draft: {
              ...e.draft,
              sections: e.draft.sections.map((s) => {
                const updated = reconciled.sections.find((u) => u.id === s.id)
                if (!updated) return s
                return {
                  ...s,
                  html: updated.html,
                  content: updated.content,
                  wordCount: recalcSectionWordCount(updated.content),
                  status: updated.content.trim() ? ('draft' as const) : s.status,
                }
              }),
            },
            citations: reconciled.citations,
          }
        })
      })()
    },
    [recordHistory],
  )

  const insertSourceFromSuggestion = useCallback(
    (suggestionId: string) => {
      void (async () => {
        const suggestion = findSuggestionById(suggestionId)
        if (!suggestion?.sourceSuggestion) return
        const src = suggestion.sourceSuggestion
        const sourceId = `src-draft-${Date.now()}`
        recordHistory()
        setEssay((e) => ({
          ...e,
          sources: [
            ...e.sources,
            {
              id: sourceId,
              title: src.title,
              url: src.url,
              type: 'secondary' as const,
              addedVia: 'ai' as const,
              summary: src.summary,
              authors: src.authors,
              year: src.year,
              enrichment: { status: 'pending' as const },
            },
          ],
        }))
        const styleId = essayRef.current.blueprint.referencingStyleId
        const newSource: SourceRecord = {
          id: sourceId,
          title: src.title,
          url: src.url,
          type: 'secondary',
          addedVia: 'ai',
          summary: src.summary,
          authors: src.authors,
          year: src.year,
          enrichment: { status: 'pending' },
        }
        const allSources = [...essayRef.current.sources, newSource]
        const priorSpans = extractAllCitationSpans(essayRef.current.draft.sections)
        const inText = await formatInTextCitation(newSource, styleId, allSources, {
          priorSourceIds: priorSpans.map((s) => s.sourceId),
        })
        const citation = src.quote ? `${src.quote} ${inText}` : inText
        if (suggestion.targetText) {
          applyTextToSection(
            suggestion.sectionId,
            suggestion.targetText,
            `${suggestion.targetText} ${citation}`,
          )
        } else {
          insertCitationAt(suggestion.sectionId, sourceId)
        }
        updateSuggestionStatus(suggestionId, 'accepted')
        void enrichSource(sourceId)
      })()
    },
    [
      applyTextToSection,
      enrichSource,
      findSuggestionById,
      insertCitationAt,
      recordHistory,
      updateSuggestionStatus,
    ],
  )

  const toggleDraftInlineHighlights = useCallback((show: boolean) => {
    setEssay((e) => ({
      ...e,
      draft: { ...e.draft, showInlineHighlights: show },
    }))
  }, [])

  const highlightDraftSuggestion = useCallback((suggestionId: string | null) => {
    setHighlightedSuggestionId(suggestionId)
  }, [])

  const setTextSelection = useCallback((range: TextSelectionRange | null) => {
    setEssay((e) => {
      const ephemeralTools: DraftToolKind[] = ['findSynonyms', 'definePhrase']
      const rewriteTools: DraftToolKind[] = ['shiftTone', 'elevatePhrasing']

      const prevText = e.workspaceContext.selectedTextRange?.text?.trim() ?? ''
      const nextText = range?.text?.trim() ?? ''
      const cleared = !nextText
      const textChanged = prevText !== nextText

      const rewriteOpen = rewriteTools.some((kind) =>
        e.draft.tools?.[kind]?.results.some((s) => s.status === 'open'),
      )

      let tools = e.draft.tools
      if ((cleared || textChanged) && tools) {
        const nextTools = { ...tools }
        for (const kind of ephemeralTools) {
          const state = nextTools[kind]
          if (!state?.results.some((s) => s.status === 'open')) continue
          nextTools[kind] = {
            ...state,
            results: state.results.map((s) =>
              s.status === 'open' ? { ...s, status: 'dismissed' as const } : s,
            ),
          }
        }
        tools = nextTools
      }

      let activeSelectionTool = e.workspaceContext.activeSelectionTool
      if (textChanged && !cleared) {
        activeSelectionTool = null
      }
      if (cleared && !rewriteOpen) {
        activeSelectionTool = null
      }

      return {
        ...e,
        draft: { ...e.draft, tools },
        workspaceContext: {
          ...e.workspaceContext,
          selectedTextRange: range,
          activeSelectionTool,
        },
      }
    })
  }, [])

  const setActiveSelectionTool = useCallback((tool: DraftToolKind | null) => {
    setEssay((e) => ({
      ...e,
      workspaceContext: { ...e.workspaceContext, activeSelectionTool: tool },
    }))
  }, [])

  const setCitationStyle = useCallback((style: CitationStyle) => {
    setEssay((e) => ({
      ...e,
      blueprint: { ...e.blueprint, citationStyle: style },
      citations: e.citations.map((c) => ({ ...c, style })),
    }))
  }, [])

  const reconcileCitations = useCallback(() => {
    void (async () => {
      const current = essayRef.current
      const result = await formatDraftCitationsAsync(
        current.draft.sections,
        current.sources,
        current.blueprint.referencingStyleId,
      )
      setEssay((e) => ({
        ...e,
        draft: {
          ...e.draft,
          sections: e.draft.sections.map((s) => {
            const updated = result.sections.find((u) => u.id === s.id)
            if (!updated) return s
            return {
              ...s,
              html: updated.html,
              content: updated.content,
              wordCount: recalcSectionWordCount(updated.content),
            }
          }),
        },
        citations: result.citations,
      }))
    })()
  }, [])

  const setReferencingStyle = useCallback(
    (styleId: ReferencingStyleId) => {
      recordHistory()
      clearCitationEngineCache()
      const citationStyle = referencingStyleToCitationStyle(styleId)

      setEssay((e) => {
        const nextBlueprint = {
          ...e.blueprint,
          referencingStyleId: styleId,
          citationStyle,
          quickSettings: {
            ...e.blueprint.quickSettings,
            referencingStyle: styleId,
            referencingStyleIsAuto: false,
          },
        }
        return {
          ...e,
          blueprint: nextBlueprint,
          citations: e.citations.map((c) => ({ ...c, style: citationStyle })),
        }
      })

      void (async () => {
        const current = essayRef.current
        const { sections, citations } = await restyleDraftCitations(
          current.draft.sections,
          current.sources,
          styleId,
          current.citations,
        )
        setEssay((e) => ({
          ...e,
          draft: {
            ...e.draft,
            sections: e.draft.sections.map((s) => {
              const updated = sections.find((u) => u.id === s.id)
              if (!updated) return s
              return {
                ...s,
                html: updated.html,
                content: updated.content,
                wordCount: recalcSectionWordCount(updated.content),
              }
            }),
          },
          citations,
        }))
      })()
    },
    [recordHistory],
  )

  const addCitation = useCallback(
    (sourceId: string, sectionId: string, inText?: string) => {
      const id = `cite-${Date.now()}`
      if (inText) {
        const style = essay.blueprint.citationStyle
        setEssay((e) => ({
          ...e,
          citations: [
            ...e.citations,
            { id, sourceId, style, inText, sectionId },
          ],
        }))
        return id
      }
      void (async () => {
        const current = essayRef.current
        const source = current.sources.find((s) => s.id === sourceId)
        if (!source) return
        const styleId = current.blueprint.referencingStyleId
        const priorSpans = extractAllCitationSpans(current.draft.sections)
        const text = await formatInTextCitation(source, styleId, current.sources, {
          priorSourceIds: priorSpans.map((s) => s.sourceId),
        })
        setEssay((e) => ({
          ...e,
          citations: [
            ...e.citations,
            {
              id,
              sourceId,
              style: e.blueprint.citationStyle,
              inText: text,
              sectionId,
            },
          ],
        }))
      })()
      return id
    },
    [essay.blueprint.citationStyle],
  )

  const executeAgentTool = useCallback(
    (tool: ToolCallPayload) => {
      switch (tool.name) {
        case 'updateBlueprintField': {
          const { field, value } = tool.args as { field: keyof EssayBlueprint; value: string }
          if (field === 'title' || field === 'thesis' || field === 'researchQuestion') {
            updateBlueprint({ [field]: value })
          }
          break
        }
        case 'updateOutlineNode': {
          const { nodeId, bullets, title } = tool.args as {
            nodeId: string
            bullets: string[]
            title?: string
          }
          updateOutlineNode(nodeId, { bullets, ...(title ? { title } : {}) })
          break
        }
        case 'writeDraftSection': {
          const { sectionId, content } = tool.args as { sectionId: string; content: string }
          updateDraftSectionContent(sectionId, contentToHtml(content), content)
          break
        }
        case 'addCitation': {
          const { sourceId, sectionId, inText } = tool.args as {
            sourceId: string
            sectionId: string
            inText?: string
          }
          addCitation(sourceId, sectionId, inText)
          break
        }
        case 'navigateToTab': {
          const { tab, blueprintSection, draftSubView } = tool.args as {
            tab: string
            blueprintSection?: string
            draftSubView?: string
          }
          let navId: AppNavId = 'blueprint'
          if (tab === 'blueprint') navId = 'blueprint'
          else if (tab === 'outline') navId = 'outline'
          else if (tab === 'draft') navId = 'draft'
          else if (tab === 'references') navId = 'references'
          else if (tab === 'export') navId = 'export'
          navigateApp(navId)
          break
        }
      }
    },
    [
      updateBlueprint,
      updateOutlineNode,
      updateDraftSectionContent,
      addCitation,
      navigateApp,
    ],
  )

  const uploadSourceStub = useCallback(
    (fileName: string, type: SourceType = 'primary') => {
      const id = addSource({
        title: fileName.replace(/\.[^.]+$/, ''),
        fileName,
        type,
        addedVia: 'upload',
      })
      void enrichSource(id)
      return id
    },
    [addSource, enrichSource],
  )

  const searchSources = useCallback(async (query: string): Promise<SourceSearchResult[]> => {
    const thesis = essayRef.current.blueprint.thesis
    const res = await fetch('/api/ai/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, thesis }),
    })
    if (await handleQuotaResponse(res)) return []
    if (!res.ok) return searchSourcesForNode(query, query)
    const data = (await res.json()) as { results?: SourceSearchResult[] }
    return data.results ?? []
  }, [handleQuotaResponse])

  const addFoundSourceToNode = useCallback(
    (
      nodeId: string,
      result: SourceSearchResult,
      quote?: string | null,
      addedVia: SourceAddedVia = 'search',
    ) => {
      recordHistory()
      const sourceId = `src-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const attachedQuotes =
        typeof quote === 'string' && quote.trim() ? [quote.trim()] : undefined
      const current = essayRef.current
      const existing = current.sources.find(
        (s) =>
          (result.url && s.url === result.url) ||
          (result.title && s.title === result.title),
      )
      const resolvedId = existing?.id ?? sourceId
      setEssay((e) => {
        const node = e.outline.nodes.find((n) => n.id === nodeId)
        if (!node || node.type !== 'subpoint') return e
        const nextSources = existing
          ? e.sources
          : [
              ...e.sources,
              {
                id: resolvedId,
                title: result.title,
                url: result.url,
                type: result.type ?? 'secondary',
                addedVia,
                summary: result.summary,
                authors: result.authors,
                year: result.year,
                publisher: result.publisher,
                enrichment: { status: 'pending' as const },
              },
            ]
        return {
          ...e,
          sources: nextSources,
          outline: {
            ...e.outline,
            nodes: e.outline.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    sourceRefs: n.sourceRefs.some((r) => r.sourceId === resolvedId)
                      ? n.sourceRefs
                      : [
                          ...n.sourceRefs,
                          {
                            sourceId: resolvedId,
                            quote: attachedQuotes?.join('\n\n'),
                            quotes: attachedQuotes,
                          },
                        ],
                  }
                : n,
            ),
          },
        }
      })
      if (!existing) {
        void enrichSource(resolvedId)
      }
      return resolvedId
    },
    [recordHistory, enrichSource],
  )

  const searchOutlineNodeStub = useCallback(
    async (nodeId: string): Promise<SourceSearchResult[]> => {
      const node = essay.outline.nodes.find((n) => n.id === nodeId)
      if (!node) return []
      return searchSources(node.title)
    },
    [essay.outline.nodes, searchSources],
  )

  return {
    tabs,
    managerTabs,
    openTabs,
    view,
    viewedTabIds,
    workflow,
    essay,
    analyzing,
    generatingOutline,
    subscriptionTier,
    themePreference,
    cycleTheme,
    activeNavId,
    navigateApp,
    activeTabKind,
    setSplitRatio,
    completeInstructions,
    approveBlueprint,
    closeTab,
    reopenTab,
    navigateToTab,
    setFocusedTabFromScroll,
    toggleTabLayout,
    moveTabSequence,
    reorderTabs,
    updateBlueprint,
    updateInstructionsText,
    attachInstructionFile,
    removeInstructionAttachment,
    clearInstructions,
    applyInstructions,
    updateQuickSettings,
    updateWordLimit,
    updateWordBudgetSection,
    updateAnalysis,
    rebalanceWordBudget,
    resetWordBudgetToTemplate,
    reorderWordBudgetSections,
    removeWordBudgetSection,
    addWordBudgetSection,
    generateFramework,
    generateOutline,
    updateOutline,
    regenerateOutline,
    runAnalyzeBlueprint,
    undo,
    redo,
    canUndo,
    canRedo,
    setOutlineNodes,
    toggleOutlineCollapse,
    expandAllOutline,
    collapseAllOutline,
    selectOutlineNode,
    selectSource,
    updateOutlineNode,
    reorderOutlineNodes,
    addOutlineNode,
    removeOutlineNode,
    convertOutlineNodeType,
    moveOutlineNode,
    attachSourceToNode,
    detachSourceFromNode,
    updateSource,
    updateSourceRefQuote,
    updateSourceRefQuotes,
    markOutlineReadyForDraft,
    generateDraftFromOutline,
    setDraftMode,
    setActiveDraftSection,
    updateDraftSectionContent,
    updateUnifiedDraft,
    regenerateFrameworkField,
    generateDraftSection,
    generateFullDraft,
    generatingFullDraft,
    draftToolScopes,
    highlightedSuggestionId,
    setDraftToolScope,
    runDraftTool,
    runAllDraftTools,
    acceptDraftSuggestion,
    dismissDraftSuggestion,
    replaceDraftSuggestion,
    acceptAllDraftTool,
    dismissAllDraftTool,
    insertCitationAt,
    insertSourceFromSuggestion,
    toggleDraftInlineHighlights,
    highlightDraftSuggestion,
    setTextSelection,
    setActiveSelectionTool,
    clearMultipurposeToolResults,
    setCitationStyle,
    setReferencingStyle,
    reconcileCitations,
    addCitation,
    enrichSource,
    evaluateSource,
    enrichAllSources,
    evaluateAllSources,
    removeSource,
    enrichingIds,
    evaluatingIds,
    bulkEnriching,
    bulkEvaluating,
    uploadSourceStub,
    searchSources,
    addFoundSourceToNode,
    searchOutlineNodeStub,
    executeAgentTool,
    saving,
    saveProgress,
    quotaError,
    clearQuotaError: () => setQuotaError(null),
    projectId,
  }
}
