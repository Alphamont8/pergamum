'use client'

import { useId } from 'react'
import './ui.css'

interface ToggleProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  const id = useId()
  return (
    <label className={`pg-toggle ${disabled ? 'is-disabled' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="pg-toggle__track" aria-hidden />
      <span className="pg-toggle__label">{label}</span>
    </label>
  )
}
