'use client'

import { useCallback, useMemo, useState } from 'react'
import { FileText } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type {
  DraftDocument as DraftDocumentType,
  DraftSuggestion,
  DraftToolKind,
  DraftToolState,
  EssayBlueprint,
  SourceRecord,
  SubscriptionTier,
} from '@/types'
import { buildWritingStyleOptions } from '@/constants/preferenceOptions'
import { DRAFT_TOOL_DEFS, type RunDraftToolOptions } from '@/lib/draft-tools'
import { createEmptyToolState } from '@/lib/draft-utils'
import { countWords } from '@/lib/draft-unified'
import { EditorToolbar } from './EditorToolbar'
import { UnifiedDraftEditor } from './UnifiedDraftEditor'
import './DraftDocument.css'

interface DraftDocumentProps {
  draft: DraftDocumentType
  blueprint: EssayBlueprint
  sources: SourceRecord[]
  generating?: boolean
  onUpdateUnified: (
    sections: Array<{ id: string; label: string; html: string; content: string }>,
  ) => void
  onInsertCitation: (sectionId: string, sourceId: string) => void
  onSelectionChange?: (sectionId: string, start: number, end: number, text: string) => void
  onSuggestionClick?: (suggestionId: string) => void
  subscriptionTier?: SubscriptionTier
  hasTextSelection?: boolean
  selectedText?: string | null
  onRunTool?: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onActiveSelectionToolChange?: (tool: DraftToolKind | null) => void
}

export function DraftDocument({
  draft,
  blueprint,
  sources,
  generating,
  onUpdateUnified,
  onInsertCitation,
  onSelectionChange,
  onSuggestionClick,
  subscriptionTier = 'Basic',
  hasTextSelection = false,
  selectedText = null,
  onRunTool,
  onActiveSelectionToolChange,
}: DraftDocumentProps) {
  const [activeEditor, setActiveEditor] = useState<Editor | null>(null)
  const [liveTotal, setLiveTotal] = useState(0)

  const wasEverGenerated = draft.generatedAt != null
  const hasContent = draft.sections.some((s) => s.content.trim().length > 0)
  const isGenerating = generating || draft.sections.some((s) => s.status === 'generating')
  const showPlaceholder = !wasEverGenerated && !hasContent && !isGenerating
  const showEditor = wasEverGenerated || hasContent

  const writingStyleOptions = useMemo(
    () => buildWritingStyleOptions(subscriptionTier).filter((o) => o.value !== 'Auto'),
    [subscriptionTier],
  )

  const getToolState = useCallback(
    (tool: DraftToolKind): DraftToolState => draft.tools?.[tool] ?? createEmptyToolState(),
    [draft.tools],
  )

  const inlineSuggestions = useMemo(() => {
    const tools = draft.tools ?? {}
    const result: DraftSuggestion[] = []
    for (const def of DRAFT_TOOL_DEFS) {
      if (!def.inlineHighlights) continue
      for (const s of tools[def.kind]?.results ?? []) {
        if (s.status === 'open' && (s.targetText || s.range)) {
          result.push(s)
        }
      }
    }
    return result
  }, [draft.tools])

  const handleEditorReady = useCallback((editor: Editor | null) => {
    setActiveEditor(editor)
  }, [])

  const handleWordCount = useCallback((total: number) => {
    setLiveTotal(total)
  }, [])

  const fallbackTotal = draft.sections.reduce(
    (n, s) => n + countWords(s.label) + countWords(s.content),
    0,
  )
  const displayTotal = activeEditor != null ? liveTotal : fallbackTotal

  return (
    <section className="draft-document" aria-label="Draft document">
      {showEditor && !isGenerating && (
        <div className="draft-document__toolbar-wrap">
          <EditorToolbar
            editor={activeEditor}
            wordCount={displayTotal}
            wordTarget={blueprint.wordBudget.total}
            sources={sources}
            activeSectionId={draft.activeSectionId ?? draft.sections[0]?.id ?? null}
            onInsertCitation={onInsertCitation}
          />
        </div>
      )}

      <div className="draft-document__scroll">
        {showPlaceholder ? (
          <div className="draft-document__placeholder">
            <div className="draft-document__placeholder-icon" aria-hidden>
              <FileText size={28} strokeWidth={1.5} />
            </div>
            <h3 className="draft-document__placeholder-title">No draft yet</h3>
            <p className="draft-document__placeholder-text">
              Generate your essay from the Outline tab. Your full draft will appear here as one
              continuous document with editable section titles.
            </p>
          </div>
        ) : isGenerating ? (
          <div className="draft-document__placeholder draft-document__placeholder--generating">
            <div className="draft-document__placeholder-icon" aria-hidden>
              <FileText size={28} strokeWidth={1.5} />
            </div>
            <h3 className="draft-document__placeholder-title">Generating draft…</h3>
            <p className="draft-document__placeholder-text">
              Writing your essay section by section from your outline and sources.
            </p>
          </div>
        ) : (
          <UnifiedDraftEditor
            draft={draft}
            inlineSuggestions={inlineSuggestions}
            showInlineHighlights={draft.showInlineHighlights !== false}
            onSuggestionClick={onSuggestionClick}
            onEditorReady={handleEditorReady}
            onUpdate={onUpdateUnified}
            onWordCountChange={handleWordCount}
            onSelectionChange={onSelectionChange}
            writingStyleOptions={writingStyleOptions}
            hasTextSelection={hasTextSelection}
            selectedText={selectedText}
            getToolState={getToolState}
            onRunTool={onRunTool}
            onActiveSelectionToolChange={onActiveSelectionToolChange}
          />
        )}
      </div>
    </section>
  )
}
