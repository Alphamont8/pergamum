"use client"

import type { ReactNode } from 'react'
import './BlueprintHeaderBtn.css'

interface BlueprintHeaderBtnProps {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  'aria-pressed'?: boolean
  'aria-label'?: string
}

export function BlueprintHeaderBtn({
  icon,
  label,
  active,
  disabled,
  onClick,
  'aria-pressed': ariaPressed,
  'aria-label': ariaLabel,
}: BlueprintHeaderBtnProps) {
  return (
    <button
      type="button"
      className={`bp-header-btn ${active ? 'bp-header-btn--active' : ''}`}
      disabled={disabled}
      aria-pressed={ariaPressed}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
    >
      <span className="bp-header-btn__icon">{icon}</span>
      <span className="bp-header-btn__label">{label}</span>
    </button>
  )
}
