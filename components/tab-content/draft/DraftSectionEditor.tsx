'use client'

import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import type { Editor } from '@tiptap/react'
import type { DraftSection, DraftSuggestion } from '@/types'
import { findTextRangeInContent } from '@/lib/draft-utils'
import { SuggestionHighlight } from './SuggestionHighlight'
import './DraftSectionEditor.css'

interface DraftSectionEditorProps {
  section: DraftSection
  targetWords?: number
  suggestions: DraftSuggestion[]
  showInlineHighlights: boolean
  isActive: boolean
  onFocus: (editor: Editor) => void
  onUpdate: (sectionId: string, html: string, text: string) => void
  onGenerate: (sectionId: string) => void
  onSuggestionClick?: (suggestionId: string) => void
  onSelectionChange?: (sectionId: string, start: number, end: number, text: string) => void
  registerScrollRef?: (sectionId: string, el: HTMLElement | null) => void
}

export function DraftSectionEditor({
  section,
  targetWords,
  suggestions,
  showInlineHighlights,
  isActive,
  onFocus,
  onUpdate,
  onGenerate,
  onSuggestionClick,
  onSelectionChange,
  registerScrollRef,
}: DraftSectionEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  const suggestionsWithRanges = suggestions.map((s) => {
    if (s.range) return s
    if (!s.targetText) return s
    const range = findTextRangeInContent(section.content, s.targetText)
    if (!range) return s
    return {
      ...s,
      range: { sectionId: section.id, from: range.from, to: range.to },
    }
  })

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: `Write ${section.label}…` }),
      CharacterCount,
      SuggestionHighlight.configure({
        suggestions: suggestionsWithRanges,
        enabled: showInlineHighlights,
        onSuggestionClick,
      }),
    ],
    content: section.html || section.content,
    editorProps: {
      attributes: {
        class: 'draft-section-editor__prose-inner',
      },
    },
    onFocus: ({ editor: ed }) => onFocus(ed),
    onSelectionUpdate: ({ editor: ed }) => {
      const { from, to } = ed.state.selection
      const text = ed.state.doc.textBetween(from, to, ' ')
      if (text.trim()) {
        onSelectionChange?.(section.id, from, to, text)
      }
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      const text = ed.getText()
      onUpdate(section.id, html, text)
    },
  })

  useEffect(() => {
    if (!editor) return
    const ext = editor.extensionManager.extensions.find((e) => e.name === 'suggestionHighlight')
    if (ext) {
      ext.options.suggestions = suggestionsWithRanges
      ext.options.enabled = showInlineHighlights
      ext.options.onSuggestionClick = onSuggestionClick
      editor.view.dispatch(editor.state.tr)
    }
  }, [editor, suggestionsWithRanges, showInlineHighlights, onSuggestionClick])

  const wasGenerating = useRef(section.status === 'generating')
  useEffect(() => {
    if (!editor) return
    if (section.status === 'generating') {
      wasGenerating.current = true
      return
    }
    if (wasGenerating.current) {
      wasGenerating.current = false
      editor.commands.setContent(section.html || '<p></p>', { emitUpdate: false })
    }
  }, [editor, section.status, section.html])

  useEffect(() => {
    registerScrollRef?.(section.id, rootRef.current)
    return () => registerScrollRef?.(section.id, null)
  }, [section.id, registerScrollRef])

  const wordCount = editor?.storage.characterCount?.words?.() ?? section.wordCount
  const countClass =
    targetWords != null
      ? wordCount > targetWords
        ? 'draft-section-editor__count--over'
        : wordCount < targetWords * 0.5 && wordCount > 0
          ? 'draft-section-editor__count--under'
          : ''
      : ''

  return (
    <article
      ref={rootRef}
      className="draft-section-editor"
      data-section-id={section.id}
      id={`draft-section-${section.id}`}
    >
      <header className="draft-section-editor__header">
        <div className="draft-section-editor__label-row">
          <h3 className="draft-section-editor__label">{section.label}</h3>
          <span
            className={`draft-section-editor__status ${section.status === 'empty' ? 'draft-section-editor__status--empty' : ''} ${section.status === 'generating' ? 'draft-section-editor__status--generating' : ''}`}
          >
            {section.status}
          </span>
        </div>
        <div className="draft-section-editor__actions">
          <span className={`draft-section-editor__count ${countClass}`}>
            {wordCount}
            {targetWords != null ? ` / ${targetWords} w` : ' w'}
          </span>
          <button
            type="button"
            className="draft-section-editor__gen-btn"
            disabled={section.status === 'generating'}
            onClick={() => onGenerate(section.id)}
          >
            {section.status === 'generating'
              ? 'Generating…'
              : section.content.trim()
                ? 'Regenerate'
                : 'Generate'}
          </button>
        </div>
      </header>
      <div
        className={`draft-section-editor__content ${isActive ? 'draft-section-editor__content--focused' : ''}`}
      >
        <div className="draft-section-editor__prose">
          <EditorContent editor={editor} />
        </div>
      </div>
    </article>
  )
}
