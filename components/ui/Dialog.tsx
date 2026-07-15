'use client'

import { useEffect, type ReactNode } from 'react'
import './ui.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="pg-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pg-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pg-dialog__header">
          <h2>{title}</h2>
        </div>
        <div className="pg-dialog__body">{children}</div>
        {footer ? <div className="pg-dialog__footer">{footer}</div> : null}
      </div>
    </div>
  )
}
