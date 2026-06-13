'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import {
  BookOpen,
  ClipboardPaste,
  Copy,
  Gem,
  Languages,
  Scissors,
  Trash2,
  Wand2,
} from 'lucide-react'
import type { DraftToolKind, DraftToolState } from '@/types'
import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import type { RunDraftToolOptions } from '@/lib/draft-tools'
import { isSelectionToolAvailable } from '@/lib/draft-utils'
import { findActiveSectionId } from './UnifiedDraftEditor'
import './EditorContextMenu.css'

interface EditorContextMenuProps {
  editor: Editor | null
  hasTextSelection: boolean
  selectedText: string | null
  writingStyleOptions: PreferenceSelectOption[]
  getToolState: (tool: DraftToolKind) => DraftToolState
  onRunTool: (tool: DraftToolKind, options?: RunDraftToolOptions) => void
  onActiveSelectionToolChange: (tool: DraftToolKind | null) => void
  onSelectionChange?: (sectionId: string, start: number, end: number, text: string) => void
}

interface MenuState {
  x: number
  y: number
  text: string
  from: number
  to: number
}

const ICON_SIZE = 14
const ICON_STROKE = 1.75

function MenuIcon({ children }: { children: ReactNode }) {
  return (
    <span className="editor-context-menu__icon" aria-hidden>
      {children}
    </span>
  )
}

export function EditorContextMenu({
  editor,
  hasTextSelection,
  selectedText,
  writingStyleOptions,
  getToolState,
  onRunTool,
  onActiveSelectionToolChange,
  onSelectionChange,
}: EditorContextMenuProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [showToneSubmenu, setShowToneSubmenu] = useState(false)

  const close = useCallback(() => {
    setMenu(null)
    setShowToneSubmenu(false)
  }, [])

  useEffect(() => {
    if (!editor) return

    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.ProseMirror')) return
      e.preventDefault()
      const { from, to } = editor.state.selection
      const text = editor.state.doc.textBetween(from, to, ' ').trim()
      setShowToneSubmenu(false)
      setMenu({ x: e.clientX, y: e.clientY, text, from, to })
    }

    const onClick = () => close()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [editor, close])

  const menuText = menu?.text?.trim() ?? ''
  const menuHasSelection = menuText.length > 0

  const availabilityInput = useMemo(
    () => ({
      hasTextSelection: menuHasSelection || hasTextSelection,
      selectedText: menuHasSelection ? menuText : selectedText,
      writingStyleOptions,
      getToolState,
    }),
    [menuHasSelection, menuText, hasTextSelection, selectedText, writingStyleOptions, getToolState],
  )

  const shiftToneAvailable = isSelectionToolAvailable('shiftTone', availabilityInput)
  const elevatePhrasingAvailable = isSelectionToolAvailable('elevatePhrasing', availabilityInput)
  const findSynonymsAvailable = isSelectionToolAvailable('findSynonyms', availabilityInput)
  const definePhraseAvailable = isSelectionToolAvailable('definePhrase', availabilityInput)

  const runTool = (tool: DraftToolKind, options?: RunDraftToolOptions) => {
    if (!editor || !menu?.text) return
    if (!isSelectionToolAvailable(tool, availabilityInput)) return
    const sectionId = findActiveSectionId(editor, menu.from)
    if (!sectionId) return

    const selection = {
      sectionId,
      start: menu.from,
      end: menu.to,
      text: menu.text,
    }
    onSelectionChange?.(sectionId, menu.from, menu.to, menu.text)
    onActiveSelectionToolChange(tool)
    onRunTool(tool, { ...options, selection })
    close()
  }

  const runClipboard = async (action: 'cut' | 'copy' | 'paste' | 'delete') => {
    if (!editor || !menu) return
    const { from, to, text } = menu

    if (action === 'cut' && text) {
      await navigator.clipboard.writeText(text)
      editor.chain().focus().deleteRange({ from, to }).run()
    } else if (action === 'copy' && text) {
      await navigator.clipboard.writeText(text)
    } else if (action === 'paste') {
      const clip = await navigator.clipboard.readText()
      editor.chain().focus().insertContentAt(from, clip).run()
    } else if (action === 'delete' && from !== to) {
      editor.chain().focus().deleteRange({ from, to }).run()
    }
    close()
  }

  if (!menu) return null

  const hasSelection = menu.text.length > 0

  return (
    <div
      className="editor-context-menu bp-card"
      style={{ top: menu.y, left: menu.x }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`editor-context-menu__item editor-context-menu__item--ai ${!shiftToneAvailable ? 'editor-context-menu__item--greyed' : ''}`}
        disabled={!shiftToneAvailable}
        onClick={() => shiftToneAvailable && setShowToneSubmenu((v) => !v)}
      >
        <MenuIcon>
          <Wand2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Shift Tone
      </button>
      {showToneSubmenu && writingStyleOptions.length > 0 && (
        <div className="editor-context-menu__submenu" role="group" aria-label="Writing styles">
          {writingStyleOptions.map((opt) => {
            const styleAvailable = shiftToneAvailable && !opt.disabled
            return (
              <button
                key={opt.value}
                type="button"
                className={`editor-context-menu__item editor-context-menu__item--ai editor-context-menu__item--sub ${!styleAvailable ? 'editor-context-menu__item--greyed' : ''}`}
                disabled={!styleAvailable}
                onClick={() =>
                  styleAvailable && runTool('shiftTone', { targetWritingStyle: opt.value })
                }
              >
                <span className="editor-context-menu__icon editor-context-menu__icon--spacer" aria-hidden />
                {opt.label}
              </button>
            )
          })}
        </div>
      )}
      <button
        type="button"
        className={`editor-context-menu__item editor-context-menu__item--ai ${!elevatePhrasingAvailable ? 'editor-context-menu__item--greyed' : ''}`}
        disabled={!elevatePhrasingAvailable}
        onClick={() => runTool('elevatePhrasing')}
      >
        <MenuIcon>
          <Gem size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Elevate Phrasing
      </button>
      <button
        type="button"
        className={`editor-context-menu__item editor-context-menu__item--ai ${!findSynonymsAvailable ? 'editor-context-menu__item--greyed' : ''}`}
        disabled={!findSynonymsAvailable}
        onClick={() => runTool('findSynonyms')}
      >
        <MenuIcon>
          <Languages size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Find Synonyms
      </button>
      <button
        type="button"
        className={`editor-context-menu__item editor-context-menu__item--ai ${!definePhraseAvailable ? 'editor-context-menu__item--greyed' : ''}`}
        disabled={!definePhraseAvailable}
        onClick={() => runTool('definePhrase')}
      >
        <MenuIcon>
          <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Define Phrase
      </button>
      <div className="editor-context-menu__divider" aria-hidden />
      <button
        type="button"
        className="editor-context-menu__item"
        disabled={!hasSelection}
        onClick={() => runClipboard('cut')}
      >
        <MenuIcon>
          <Scissors size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Cut
      </button>
      <button
        type="button"
        className="editor-context-menu__item"
        disabled={!hasSelection}
        onClick={() => runClipboard('copy')}
      >
        <MenuIcon>
          <Copy size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Copy
      </button>
      <button type="button" className="editor-context-menu__item" onClick={() => runClipboard('paste')}>
        <MenuIcon>
          <ClipboardPaste size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Paste
      </button>
      <button
        type="button"
        className="editor-context-menu__item"
        disabled={!hasSelection}
        onClick={() => runClipboard('delete')}
      >
        <MenuIcon>
          <Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </MenuIcon>
        Delete
      </button>
    </div>
  )
}
