'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Heading1, Heading2, Heading3, Pilcrow } from 'lucide-react'
import type { BlockTypeOption } from '@/lib/draft-editor-commands'
import './BlockTypeDropdown.css'

const OPTIONS = [
  { value: 'p' as const, label: 'Paragraph', Icon: Pilcrow },
  { value: 'h1' as const, label: 'Heading 1', Icon: Heading1 },
  { value: 'h2' as const, label: 'Heading 2', Icon: Heading2 },
  { value: 'h3' as const, label: 'Heading 3', Icon: Heading3 },
]

interface BlockTypeDropdownProps {
  value: BlockTypeOption
  onChange: (value: BlockTypeOption) => void
}

export function BlockTypeDropdown({ value, onChange }: BlockTypeDropdownProps) {
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
    <div className="block-type-dropdown" ref={rootRef}>
      <button
        type="button"
        className="block-type-dropdown__trigger"
        aria-label="Text style"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <CurrentIcon size={14} strokeWidth={1.75} />
        <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <ul className="block-type-dropdown__menu bp-card" role="menu">
          {OPTIONS.map(({ value: v, label, Icon }) => (
            <li key={v} role="none">
              <button
                type="button"
                role="menuitem"
                className={`block-type-dropdown__item ${v === value ? 'block-type-dropdown__item--active' : ''}`}
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
