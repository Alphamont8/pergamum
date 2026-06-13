'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Heading from '@tiptap/extension-heading'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { mergeAttributes } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { DraftDocument, DraftSuggestion, DraftToolKind } from '@/types'
import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import type { RunDraftToolOptions } from '@/lib/draft-tools'
import { SuggestionHighlight } from './SuggestionHighlight'
import { computeLiveWordCounts } from '@/lib/draft-editor-commands'
import { buildUnifiedDraftHtml, countWords, parseUnifiedDraftHtml } from '@/lib/draft-unified'
import { IndentParagraph, TabIndent } from './IndentExtension'
import { Citation } from './CitationExtension'
import { EditorContextMenu } from './EditorContextMenu'
import './UnifiedDraftEditor.css'
import './EditorContextMenu.css'

const AppHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      sectionId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-section-id'),
        renderHTML: (attributes) => {
          if (!attributes.sectionId) return {}
          return { 'data-section-id': attributes.sectionId }
        },
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const levels = this.options.levels
    const level = levels.includes(node.attrs.level) ? node.attrs.level : levels[0]
    const sectionAttrs = node.attrs.sectionId
      ? { 'data-section-id': node.attrs.sectionId as string }
      : {}
    return [`h${level}`, mergeAttributes(HTMLAttributes, sectionAttrs), 0]
  },
}).configure({ levels: [1, 2, 3] })

interface UnifiedDraftEditorProps {
  draft: DraftDocument
  inlineSuggestions?: DraftSuggestion[]
  showInlineHighlights?: boolean
  onSuggestionClick?: (suggestionId: string) => void
  onEditorReady: (editor: Editor | null) => void
  onUpdate: (sections: Array<{ id: string; label: string; html: string; content: string }>) => void
  onWordCountChange?: (total: number) => void
  onSelectionChange?: (sectionId: string, start: number, end: number, text: string) => void
  writingStyleOptions?: PreferenceSelectOption[]
  hasTextSelection?: boolean
  selectedText?: string | null
  getToolState?: (tool: DraftToolKind) => import('@/types').DraftToolState
  onRunTool?: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onActiveSelectionToolChange?: (tool: DraftToolKind | null) => void
}

export function UnifiedDraftEditor({
  draft,
  inlineSuggestions = [],
  showInlineHighlights = true,
  onSuggestionClick,
  onEditorReady,
  onUpdate,
  onWordCountChange,
  onSelectionChange,
  writingStyleOptions = [],
  hasTextSelection = false,
  selectedText = null,
  getToolState,
  onRunTool,
  onActiveSelectionToolChange,
}: UnifiedDraftEditorProps) {
  const initialHtml = useMemo(() => buildUnifiedDraftHtml(draft.sections), [draft.sections])
  const sectionOrderRef = useRef(draft.sections)
  sectionOrderRef.current = draft.sections
  const wasGenerating = useRef(
    draft.sections.some((s) => s.status === 'generating'),
  )

  const emitWordCount = (ed: Editor) => {
    const { total } = computeLiveWordCounts(ed, sectionOrderRef.current)
    onWordCountChange?.(total)
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        horizontalRule: false,
        blockquote: false,
        codeBlock: false,
      }),
      IndentParagraph,
      TabIndent,
      AppHeading,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Start writing your essay…' }),
      CharacterCount,
      Subscript,
      Superscript,
      Citation,
      SuggestionHighlight.configure({
        suggestions: inlineSuggestions,
        enabled: showInlineHighlights,
        onSuggestionClick,
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: 'unified-draft-editor__prose' },
    },
    onCreate: ({ editor: ed }) => {
      onEditorReady(ed)
      emitWordCount(ed)
    },
    onDestroy: () => onEditorReady(null),
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      const text = ed.state.doc.textBetween(from, to, ' ')
      const activeSectionId = findActiveSectionId(ed, from)
      if (activeSectionId) {
        onSelectionChange?.(activeSectionId, from, to, text)
      }
    },
    onUpdate: ({ editor: ed }) => {
      const { sections } = parseUnifiedDraftHtml(ed.getHTML(), sectionOrderRef.current)
      onUpdate(sections)
      emitWordCount(ed)
    },
    onTransaction: ({ editor: ed }) => {
      emitWordCount(ed)
    },
  })

  useEffect(() => {
    if (!editor) return
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'suggestionHighlight')
    if (ext) {
      ext.options.suggestions = inlineSuggestions
      ext.options.enabled = showInlineHighlights
      ext.options.onSuggestionClick = onSuggestionClick
      editor.view.dispatch(editor.state.tr)
    }
  }, [editor, inlineSuggestions, showInlineHighlights, onSuggestionClick])

  useEffect(() => {
    if (!editor) return
    const generating = draft.sections.some((s) => s.status === 'generating')
    if (generating) {
      wasGenerating.current = true
      return
    }
    if (wasGenerating.current) {
      wasGenerating.current = false
      editor.commands.setContent(buildUnifiedDraftHtml(draft.sections), { emitUpdate: false })
      emitWordCount(editor)
    }
  }, [editor, draft.sections])

  return (
    <div className="unified-draft-editor">
      <EditorContent editor={editor} />
      <EditorContextMenu
        editor={editor}
        hasTextSelection={hasTextSelection}
        selectedText={selectedText}
        writingStyleOptions={writingStyleOptions}
        getToolState={getToolState ?? (() => ({ status: 'idle', lastRunAt: null, results: [] }))}
        onRunTool={onRunTool ?? (() => {})}
        onActiveSelectionToolChange={onActiveSelectionToolChange ?? (() => {})}
        onSelectionChange={onSelectionChange}
      />
    </div>
  )
}

export function findActiveSectionId(ed: Editor, pos: number): string | null {
  let sectionId: string | null = null
  ed.state.doc.descendants((node, nodePos) => {
    if (node.type.name === 'heading' && node.attrs.sectionId) {
      if (nodePos <= pos) sectionId = node.attrs.sectionId as string
    }
  })
  return sectionId
}

export function computeSectionWordCounts(
  sections: Array<{ id: string; content: string }>,
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of sections) counts[s.id] = countWords(s.content)
  return counts
}
