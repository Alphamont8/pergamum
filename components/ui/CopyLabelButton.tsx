'use client'

import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/Button'

export function CopyLabelButton({
  label,
  copied,
  ...props
}: {
  label: string
  copied: boolean
} & Omit<ComponentProps<typeof Button>, 'children' | 'variant' | 'size'>) {
  return (
    <Button variant="success" size="sm" className="pg-btn--copy-slot" {...props}>
      <span className="pg-btn__copy-slot" aria-live="polite">
        <span className={copied ? 'is-shown' : ''}>Copied</span>
        <span className={!copied ? 'is-shown' : ''}>{label}</span>
      </span>
    </Button>
  )
}
