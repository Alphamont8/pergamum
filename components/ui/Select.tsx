'use client'

import { useEffect, useId, useRef, useState } from 'react'
import './ui.css'

export interface SelectOption {
  value: string
  label: string
  /** When true, selecting opens an upsell path instead of changing value. */
  locked?: boolean
  badge?: string
}

interface SelectProps {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** Called when the user clicks a locked option. */
  onLockedSelect?: (value: string) => void
  className?: string
  id?: string
  disabled?: boolean
  align?: 'start' | 'end'
}

export function Select({
  label,
  value,
  options,
  onChange,
  onLockedSelect,
  className = '',
  id,
  disabled = false,
  align = 'start',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const fieldId = id ?? listId
  const selected = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`pg-select ${className}`.trim()} ref={rootRef}>
      {label ? (
        <label className="pg-select__label" htmlFor={fieldId}>
          {label}
        </label>
      ) : null}
      <button
        type="button"
        id={fieldId}
        className="pg-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? 'Select'}</span>
        <span className="pg-select__chevron" aria-hidden />
      </button>
      {open ? (
        <ul id={listId} role="listbox" className={`pg-select__menu pg-select__menu--${align}`}>
          {options.map((opt) => (
            <li key={opt.value} role="option" aria-selected={opt.value === value}>
              <button
                type="button"
                className={`pg-select__option ${opt.value === value ? 'is-selected' : ''} ${opt.locked ? 'is-locked' : ''}`.trim()}
                onClick={() => {
                  if (opt.locked) {
                    onLockedSelect?.(opt.value)
                    setOpen(false)
                    return
                  }
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span className="pg-select__option-label">{opt.label}</span>
                {opt.badge ? <span className="pg-select__badge">{opt.badge}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
