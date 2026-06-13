"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { SELECTABLE_PLANS } from '../../constants/preferenceOptions'
import type { SubscriptionTier } from '../../types'
import './PlanSelector.css'

interface PlanSelectorProps {
  value: SubscriptionTier
  onChange: (plan: SubscriptionTier) => void
}

export function PlanSelector({ value, onChange }: PlanSelectorProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const display =
    SELECTABLE_PLANS.find((p) => p === value) ?? value

  return (
    <div className="plan-selector" ref={rootRef}>
      <button
        type="button"
        className="plan-selector__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{display}</span>
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="plan-selector__list" role="listbox">
          {SELECTABLE_PLANS.map((plan) => (
            <li key={plan} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={plan === value}
                className={`plan-selector__option ${plan === value ? 'plan-selector__option--active' : ''}`}
                onClick={() => {
                  onChange(plan)
                  setOpen(false)
                }}
              >
                {plan}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
