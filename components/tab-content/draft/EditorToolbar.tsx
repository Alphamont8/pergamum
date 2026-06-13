'use client'

import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  Bold,
  Eraser,
  Italic,
  Link2,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
  Undo2,
} from 'lucide-react'
import type { SourceRecord } from '@/types'
import { applyBlockType, getBlockType, type BlockTypeOption } from '@/lib/draft-editor-commands'
import { AlignDropdown } from './toolbar/AlignDropdown'
import { BlockTypeDropdown } from './toolbar/BlockTypeDropdown'
import './EditorToolbar.css'
import './toolbar/AlignDropdown.css'
import './toolbar/BlockTypeDropdown.css'

interface EditorToolbarProps {
  editor: Editor | null
  wordCount?: number
  wordTarget?: number
  sources?: SourceRecord[]
  activeSectionId?: string | null
  onInsertCitation?: (sectionId: string, sourceId: string) => void
}

function ToolbarDivider() {
  return <div className="editor-toolbar__divider" aria-hidden />
}

function ToolbarBtn({
  active,
  disabled,
  onClick,
  label,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`editor-toolbar__btn ${active ? 'editor-toolbar__btn--active' : ''}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function getAlignValue(editor: Editor): 'left' | 'center' | 'right' | 'justify' {
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}

function ToolbarInner({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
      isBold: ed.isActive('bold'),
      isItalic: ed.isActive('italic'),
      isUnderline: ed.isActive('underline'),
      isStrike: ed.isActive('strike'),
      isSubscript: ed.isActive('subscript'),
      isSuperscript: ed.isActive('superscript'),
      isBulletList: ed.isActive('bulletList'),
      isOrderedList: ed.isActive('orderedList'),
      isLink: ed.isActive('link'),
      blockType: getBlockType(ed),
      align: getAlignValue(ed),
    }),
  })

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Enter URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <>
      <div className="editor-toolbar__group">
        <ToolbarBtn disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} label="Undo">
          <Undo2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} label="Redo">
          <Redo2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>

      <ToolbarDivider />

      <div className="editor-toolbar__group">
        <BlockTypeDropdown
          value={state.blockType}
          onChange={(v) => applyBlockType(editor, v)}
        />
      </div>

      <div className="editor-toolbar__group">
        <ToolbarBtn active={state.isBold} onClick={() => editor.chain().focus().toggleBold().run()} label="Bold">
          <Bold size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isItalic} onClick={() => editor.chain().focus().toggleItalic().run()} label="Italic">
          <Italic size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isUnderline} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Underline">
          <Underline size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()} label="Strikethrough">
          <Strikethrough size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isSubscript} onClick={() => editor.chain().focus().toggleSubscript().run()} label="Subscript">
          <Subscript size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isSuperscript} onClick={() => editor.chain().focus().toggleSuperscript().run()} label="Superscript">
          <Superscript size={14} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>

      <ToolbarDivider />

      <div className="editor-toolbar__group">
        <ToolbarBtn active={state.isBulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Bullet list">
          <List size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn active={state.isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Numbered list">
          <ListOrdered size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <AlignDropdown
          value={state.align}
          onChange={(v) => editor.chain().focus().setTextAlign(v).run()}
        />
      </div>

      <ToolbarDivider />

      <div className="editor-toolbar__group">
        <ToolbarBtn active={state.isLink} onClick={setLink} label="Insert link">
          <Link2 size={14} strokeWidth={1.75} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          label="Clear formatting"
        >
          <Eraser size={14} strokeWidth={1.75} />
        </ToolbarBtn>
      </div>
    </>
  )
}

export function EditorToolbar({
  editor,
  wordCount,
  wordTarget,
  sources = [],
  activeSectionId,
  onInsertCitation,
}: EditorToolbarProps) {
  const showCount = wordTarget != null && wordCount != null
  const sectionId = activeSectionId ?? null

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="editor-toolbar__main">
        {editor ? (
          <>
            <ToolbarInner editor={editor} />
            {onInsertCitation && sectionId && sources.length > 0 && (
              <>
                <ToolbarDivider />
                <select
                  className="editor-toolbar__citation-select"
                  aria-label="Insert citation"
                  defaultValue=""
                  onChange={(e) => {
                    const sourceId = e.target.value
                    if (sourceId) {
                      onInsertCitation(sectionId, sourceId)
                      e.target.value = ''
                    }
                  }}
                >
                  <option value="" disabled>
                    Insert citation…
                  </option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title.slice(0, 48)}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        ) : (
          <span className="editor-toolbar__hint">Click in the document to format text</span>
        )}
      </div>
      {showCount && (
        <span className="editor-toolbar__word-count" aria-live="polite">
          Total:{' '}
          <strong
            className={
              wordCount > wordTarget ? 'editor-toolbar__word-count-value--over' : undefined
            }
          >
            {wordCount}
          </strong>{' '}
          / {wordTarget}
        </span>
      )}
    </div>
  )
}
