'use client'

import type { ReactNode } from 'react'
import './ToolbarTooltip.css'

interface ToolbarTooltipProps {
  label: string
  children: ReactNode
}

export function ToolbarTooltip({ label, children }: ToolbarTooltipProps) {
  return (
    <span className="toolbar-tooltip">
      {children}
      <span className="toolbar-tooltip__label" role="tooltip">
        {label}
      </span>
    </span>
  )
}
