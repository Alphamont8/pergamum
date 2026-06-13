"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PreferenceSelectOption } from '../../../constants/preferenceOptions'
import './PreferenceSelect.css'

export type { PreferenceSelectOption }

interface PreferenceSelectProps {
  label: string
  hint?: string
  value: string
  options: PreferenceSelectOption[]
  disabled?: boolean
  span?: 'default' | 'full'
  onChange: (value: string) => void
  afterTrigger?: React.ReactNode
  footer?: React.ReactNode
}

export function PreferenceSelect({
  label,
  hint,
  value,
  options,
  disabled,
  span = 'default',
  onChange,
  afterTrigger,
  footer,
}: PreferenceSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div
      className={`preference-select ${span === 'full' ? 'preference-select--full' : ''} ${disabled ? 'preference-select--disabled' : ''}`}
      ref={rootRef}
    >
      <span className="preference-select__label bp-field-label">{label}</span>
      <button
        type="button"
        className="preference-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="preference-select__value">{selected?.label ?? value}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {afterTrigger}
      {hint && <p className="preference-select__hint">{hint}</p>}
      {open && (
        <ul id={listId} className="preference-select__list" role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`preference-select__option ${opt.value === value ? 'preference-select__option--active' : ''} ${opt.disabled ? 'preference-select__option--locked' : ''}`}
                disabled={opt.disabled}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange(opt.value)
                    setOpen(false)
                  }
                }}
              >
                <span className="preference-select__option-row">
                  <span>{opt.label}</span>
                  {opt.planTag && (
                    <span className="preference-select__plan-tag">{opt.planTag}</span>
                  )}
                </span>
                {opt.hint && <span className="preference-select__option-hint">{opt.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  )
}
