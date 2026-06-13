'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import { PreferenceSelect } from '../blueprint/PreferenceSelect'
import {
  getDraftToolDef,
  getMultipurposeToolDefs,
  type RunDraftToolOptions,
} from '@/lib/draft-tools'
import {
  hasRewriteSessionActive,
  isSelectionToolAvailable,
} from '@/lib/draft-utils'
import type { DraftToolKind, DraftToolState } from '@/types'
import { SelectionToolOutput } from './SelectionToolOutput'
import { SuggestionItem } from './SuggestionItem'
import '../blueprint/PreferenceSelect.css'
import './SelectionToolsCard.css'

const REWRITE_TOOLS: DraftToolKind[] = ['shiftTone', 'elevatePhrasing']

interface SelectionToolsCardProps {
  activeTool: DraftToolKind | null
  hasTextSelection: boolean
  selectedText: string | null
  writingStyleOptions: PreferenceSelectOption[]
  selectedWritingStyle: string
  onWritingStyleChange: (style: string) => void
  getToolState: (tool: DraftToolKind) => DraftToolState
  onActiveToolChange: (tool: DraftToolKind | null) => void
  onRunTool: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onAccept: (id: string) => void
  onDismiss: (id: string) => void
  onReplace: (id: string, text: string) => void
  onClearMultipurposeResults: () => void
}

export function SelectionToolsCard({
  activeTool,
  hasTextSelection,
  selectedText,
  writingStyleOptions,
  selectedWritingStyle,
  onWritingStyleChange,
  getToolState,
  onActiveToolChange,
  onRunTool,
  onAccept,
  onDismiss,
  onReplace,
  onClearMultipurposeResults,
}: SelectionToolsCardProps) {
  const multipurposeTools = useMemo(() => getMultipurposeToolDefs(), [])
  const [showShiftTonePicker, setShowShiftTonePicker] = useState(false)
  const [sessionTool, setSessionTool] = useState<DraftToolKind | null>(null)
  const prevSelectionText = useRef<string | null>(null)

  const availabilityInput = useMemo(
    () => ({
      hasTextSelection,
      selectedText,
      writingStyleOptions,
      getToolState,
    }),
    [hasTextSelection, selectedText, writingStyleOptions, getToolState],
  )

  const rewriteSessionActive = hasRewriteSessionActive(getToolState)

  const rewriteToolWithUi = REWRITE_TOOLS.find((kind) => {
    const toolState = getToolState(kind)
    return (
      toolState.status === 'running' ||
      toolState.results.some((s) => s.status === 'open')
    )
  })

  const ephemeralTool =
    activeTool && !REWRITE_TOOLS.includes(activeTool) ? activeTool : null

  const displayTool =
    rewriteToolWithUi ?? (hasTextSelection ? ephemeralTool : null)

  const displayDef = displayTool ? getDraftToolDef(displayTool) : null
  const displayState = displayTool ? getToolState(displayTool) : null
  const openResults = displayState?.results.filter((s) => s.status === 'open') ?? []
  const running = displayState?.status === 'running'
  const latestResult = openResults[openResults.length - 1]

  useEffect(() => {
    const trimmed = selectedText?.trim() ?? ''
    if (!hasTextSelection || !trimmed) {
      if (!rewriteSessionActive) {
        setSessionTool(null)
        setShowShiftTonePicker(false)
      }
      prevSelectionText.current = null
      return
    }
    if (prevSelectionText.current != null && prevSelectionText.current !== trimmed) {
      setSessionTool(null)
      setShowShiftTonePicker(false)
      onActiveToolChange(null)
    }
    prevSelectionText.current = trimmed
  }, [selectedText, hasTextSelection, rewriteSessionActive, onActiveToolChange])

  const resolvedStyle =
    selectedWritingStyle ||
    writingStyleOptions.find((o) => !o.disabled)?.value ||
    writingStyleOptions[0]?.value ||
    ''

  const shiftToneStyleValid = Boolean(
    resolvedStyle && writingStyleOptions.find((o) => o.value === resolvedStyle && !o.disabled),
  )

  const finishRewrite = () => {
    setShowShiftTonePicker(false)
    setSessionTool(null)
    onClearMultipurposeResults()
  }

  const handleAccept = (id: string) => {
    const suggestion = displayState?.results.find((s) => s.id === id)
    onAccept(id)
    if (suggestion?.tool && REWRITE_TOOLS.includes(suggestion.tool)) {
      finishRewrite()
    }
  }

  const handleDismiss = (id: string) => {
    const suggestion = displayState?.results.find((s) => s.id === id)
    onDismiss(id)
    if (suggestion?.tool && REWRITE_TOOLS.includes(suggestion.tool)) {
      finishRewrite()
    }
  }

  const runShiftTone = (style: string) => {
    const opt = writingStyleOptions.find((o) => o.value === style)
    if (!style || opt?.disabled) return
    setSessionTool('shiftTone')
    onActiveToolChange('shiftTone')
    onRunTool('shiftTone', { targetWritingStyle: style })
  }

  const handleFunctionClick = (kind: DraftToolKind) => {
    if (rewriteSessionActive || running || isButtonDisabled(kind)) return
    const def = getDraftToolDef(kind)
    setSessionTool(kind)
    onActiveToolChange(kind)

    if (def.requiresStylePicker) {
      setShowShiftTonePicker(true)
      return
    }

    setShowShiftTonePicker(false)
    onRunTool(kind)
  }

  const handleStyleChange = (style: string) => {
    onWritingStyleChange(style)
  }

  const handleShiftToneRun = () => {
    if (!shiftToneStyleValid || rewriteSessionActive || running) return
    runShiftTone(resolvedStyle)
  }

  function isButtonDisabled(kind: DraftToolKind): boolean {
    return !isSelectionToolAvailable(kind, availabilityInput)
  }

  function isButtonGreyed(kind: DraftToolKind): boolean {
    if (rewriteSessionActive || running) return true
    return isButtonDisabled(kind) && (hasTextSelection || kind === 'findSynonyms')
  }

  const functionsLocked = !hasTextSelection && !rewriteSessionActive

  const usesSuggestionItem =
    displayDef?.kind === 'shiftTone' || displayDef?.kind === 'elevatePhrasing'

  return (
    <article className="selection-tools-card bp-card" aria-label="Selection tools">
      <div
        className={`selection-tools-card__functions ${functionsLocked ? 'selection-tools-card__functions--locked' : ''}`}
        role="group"
        aria-label="Selection tool functions"
      >
        {multipurposeTools.map((def) => {
          const Icon = def.icon
          const isActive = sessionTool === def.kind
          const greyed = isButtonGreyed(def.kind)
          return (
            <button
              key={def.kind}
              type="button"
              disabled={isButtonDisabled(def.kind)}
              className={`selection-tools-card__function ${isActive ? 'selection-tools-card__function--active' : ''} ${greyed ? 'selection-tools-card__function--greyed' : ''}`}
              onClick={() => handleFunctionClick(def.kind)}
              title={def.title}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              <span className="selection-tools-card__function-label">{def.title}</span>
            </button>
          )
        })}
      </div>

      <p className="selection-tools-card__hint">
        Highlight text in the document to run these tools.
      </p>

      {showShiftTonePicker && sessionTool === 'shiftTone' && !running && (
        <div className="selection-tools-card__style-picker">
          <div className="selection-tools-card__style-row">
            <PreferenceSelect
              label="Writing Style"
              span="full"
              value={resolvedStyle}
              options={writingStyleOptions}
              onChange={handleStyleChange}
            />
            <button
              type="button"
              className="bp-btn-secondary selection-tools-card__style-run-btn"
              disabled={!shiftToneStyleValid || rewriteSessionActive}
              onClick={handleShiftToneRun}
            >
              <Play size={12} strokeWidth={2} aria-hidden />
              Run
            </button>
          </div>
        </div>
      )}

      {displayTool && (running || latestResult) && (
        <div className="selection-tools-card__results">
          {running && !latestResult ? (
            <p className="selection-tool-output selection-tool-output--loading">Running…</p>
          ) : latestResult && displayDef ? (
            usesSuggestionItem ? (
              <SuggestionItem
                suggestion={latestResult}
                showGoTo={false}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
                onReplace={onReplace}
                onScrollTo={() => {}}
              />
            ) : (
              <SelectionToolOutput
                suggestion={latestResult}
                variant={displayDef.kind === 'definePhrase' ? 'define' : 'default'}
                showsWordAlternatives={displayDef.showsWordAlternatives}
                onReplace={displayDef.showsWordAlternatives ? onReplace : undefined}
              />
            )
          ) : null}
        </div>
      )}
    </article>
  )
}
