"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { AppIcon } from '@/components/ui/AppIcon'
import './SettingSelect.css'

export interface SettingSelectOption {
  value: string
  label: string
  disabled?: boolean
  hint?: string
}

interface SettingSelectProps {
  label: string
  tooltip?: string
  value: string
  options: SettingSelectOption[]
  disabled?: boolean
  onChange: (value: string) => void
  footer?: React.ReactNode
}

export function SettingSelect({
  label,
  tooltip,
  value,
  options,
  disabled,
  onChange,
  footer,
}: SettingSelectProps) {
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
    <div className={`setting-select ${disabled ? 'setting-select--disabled' : ''}`} ref={rootRef}>
      <div className="setting-select__label-row">
        <span className="setting-select__label">{label}</span>
        {tooltip && (
          <button
            type="button"
            className="setting-select__info"
            aria-label={`About ${label}`}
            title={tooltip}
          >
            i
          </button>
        )}
      </div>
      <button
        type="button"
        className="setting-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="setting-select__value">{selected?.label ?? value}</span>
        <AppIcon size={12} strokeWidth={2}>
          <path d="M6 9l6 6 6-6" />
        </AppIcon>
      </button>
      {open && (
        <ul id={listId} className="setting-select__list" role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`setting-select__option ${opt.value === value ? 'setting-select__option--active' : ''}`}
                disabled={opt.disabled}
                onClick={() => {
                  if (!opt.disabled) {
                    onChange(opt.value)
                    setOpen(false)
                  }
                }}
              >
                <span>{opt.label}</span>
                {opt.hint && <span className="setting-select__option-hint">{opt.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {footer}
    </div>
  )
}
