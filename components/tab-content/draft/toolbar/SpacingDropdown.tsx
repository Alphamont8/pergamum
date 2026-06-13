'use client'

import { useEffect, useRef, useState } from 'react'
import { BetweenVerticalStart } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import {
  LINE_HEIGHT_OPTIONS,
  MARGIN_AFTER_OPTIONS,
  MARGIN_BEFORE_OPTIONS,
  getSpacingState,
  setLineHeight,
  setMarginAfter,
  setMarginBefore,
} from '../SpacingExtension'
import { ToolbarTooltip } from './ToolbarTooltip'
import './SpacingDropdown.css'

interface SpacingDropdownProps {
  editor: Editor
  lineHeight: string
  marginBefore: number
  marginAfter: number | null
}

export function SpacingDropdown({
  editor,
  lineHeight,
  marginBefore,
  marginAfter,
}: SpacingDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const afterValue = marginAfter ?? -1

  return (
    <div className="spacing-dropdown" ref={rootRef}>
      <ToolbarTooltip label="Line & paragraph spacing">
        <button
          type="button"
          className="spacing-dropdown__trigger"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <BetweenVerticalStart size={14} strokeWidth={1.75} />
        </button>
      </ToolbarTooltip>
      {open && (
        <div className="spacing-dropdown__panel bp-card" role="dialog" aria-label="Line and paragraph spacing">
          <fieldset className="spacing-dropdown__section">
            <legend className="spacing-dropdown__legend bp-field-label">Line spacing</legend>
            <div className="spacing-dropdown__options">
              {LINE_HEIGHT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`spacing-dropdown__option ${lineHeight === opt.value ? 'spacing-dropdown__option--active' : ''}`}
                  onClick={() => {
                    setLineHeight(editor, opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="spacing-dropdown__section">
            <legend className="spacing-dropdown__legend bp-field-label">Space before paragraph</legend>
            <div className="spacing-dropdown__options">
              {MARGIN_BEFORE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`spacing-dropdown__option ${marginBefore === opt.value ? 'spacing-dropdown__option--active' : ''}`}
                  onClick={() => {
                    setMarginBefore(editor, opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="spacing-dropdown__section">
            <legend className="spacing-dropdown__legend bp-field-label">Space after paragraph</legend>
            <div className="spacing-dropdown__options">
              {MARGIN_AFTER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`spacing-dropdown__option ${afterValue === opt.value ? 'spacing-dropdown__option--active' : ''}`}
                  onClick={() => {
                    setMarginAfter(editor, opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  )
}

export function readSpacingFromEditor(editor: Editor) {
  return getSpacingState(editor)
}
