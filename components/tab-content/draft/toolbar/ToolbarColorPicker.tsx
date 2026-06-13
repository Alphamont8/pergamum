'use client'

import { useEffect, useRef, useState } from 'react'
import { Highlighter, X } from 'lucide-react'
import { ToolbarTooltip } from './ToolbarTooltip'
import './ToolbarColorPicker.css'

const TEXT_SWATCHES = [
  '#2a2622',
  '#5762d5',
  '#c44e4e',
  '#2a7a4b',
  '#8a5a10',
  '#6b5b95',
]

const HIGHLIGHT_SWATCHES = [
  '#fff3a3',
  '#ffd6d6',
  '#d4edda',
  '#cce5ff',
  '#f3e5f5',
  '#ffe0b2',
]

interface ToolbarColorPickerProps {
  label: string
  value: string
  mode: 'text' | 'highlight'
  onChange: (color: string) => void
  onClear?: () => void
}

export function ToolbarColorPicker({
  label,
  value,
  mode,
  onChange,
  onClear,
}: ToolbarColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const rootRef = useRef<HTMLDivElement>(null)
  const swatches = mode === 'highlight' ? HIGHLIGHT_SWATCHES : TEXT_SWATCHES
  const hasHighlight = mode === 'highlight' && value && value !== 'transparent'

  useEffect(() => {
    setDraft(value === 'transparent' ? '#fff3a3' : value)
  }, [value])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="toolbar-color-picker" ref={rootRef}>
      <ToolbarTooltip label={label}>
        <button
          type="button"
          className="toolbar-color-picker__trigger"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {mode === 'highlight' ? (
            <span className="toolbar-color-picker__highlight-icon" aria-hidden>
              <Highlighter size={13} strokeWidth={1.75} />
              <span
                className="toolbar-color-picker__highlight-bar"
                style={{ background: hasHighlight ? value : 'transparent' }}
              />
            </span>
          ) : (
            <>
              <span className="toolbar-color-picker__icon toolbar-color-picker__icon--text">A</span>
              <span className="toolbar-color-picker__swatch" style={{ background: value }} aria-hidden />
            </>
          )}
        </button>
      </ToolbarTooltip>
      {open && (
        <div className="toolbar-color-picker__panel bp-card" role="dialog" aria-label={label}>
          <p className="toolbar-color-picker__heading bp-field-label">{label}</p>
          {mode === 'highlight' && onClear && (
            <button
              type="button"
              className="toolbar-color-picker__none"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              <X size={12} strokeWidth={2} />
              No highlight
            </button>
          )}
          <div className="toolbar-color-picker__swatches">
            {swatches.map((color) => (
              <button
                key={color}
                type="button"
                className={`toolbar-color-picker__chip ${color === value ? 'toolbar-color-picker__chip--active' : ''}`}
                style={{ background: color }}
                aria-label={color}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
              />
            ))}
          </div>
          <div className="toolbar-color-picker__custom">
            <label className="toolbar-color-picker__hex-label bp-field-label">Custom</label>
            <div className="toolbar-color-picker__hex-row">
              <input
                type="color"
                className="toolbar-color-picker__native"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  onChange(e.target.value)
                }}
              />
              <input
                type="text"
                className="toolbar-color-picker__hex bp-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (/^#[0-9a-fA-F]{6}$/.test(draft)) onChange(draft)
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
