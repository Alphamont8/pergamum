'use client'

import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown } from 'lucide-react'
import './AlignDropdown.css'

const OPTIONS = [
  { value: 'left', label: 'Align left', Icon: AlignLeft },
  { value: 'center', label: 'Align center', Icon: AlignCenter },
  { value: 'right', label: 'Align right', Icon: AlignRight },
  { value: 'justify', label: 'Justify', Icon: AlignJustify },
] as const

interface AlignDropdownProps {
  value: string
  onChange: (value: 'left' | 'center' | 'right' | 'justify') => void
}

export function AlignDropdown({ value, onChange }: AlignDropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const current = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]
  const CurrentIcon = current.Icon

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div className="align-dropdown" ref={rootRef}>
      <button
        type="button"
        className="align-dropdown__trigger"
        aria-label="Alignment"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CurrentIcon size={14} strokeWidth={1.75} />
        <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <ul className="align-dropdown__menu bp-card" role="menu">
          {OPTIONS.map(({ value: v, label, Icon }) => (
            <li key={v} role="none">
              <button
                type="button"
                role="menuitem"
                className={`align-dropdown__item ${v === value ? 'align-dropdown__item--active' : ''}`}
                onClick={() => {
                  onChange(v)
                  setOpen(false)
                }}
              >
                <Icon size={14} strokeWidth={1.75} />
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
