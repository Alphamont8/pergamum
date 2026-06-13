"use client"

import type { CSSProperties, ReactNode } from 'react'

type GlassVariant = 'capsule' | 'panel' | 'none'
type GlassTone = 'default' | 'subtle' | 'taskbar' | 'chrome' | 'glassy'

interface GlassSurfaceProps {
  children: ReactNode
  className?: string
  variant?: GlassVariant
  tone?: GlassTone
  style?: CSSProperties
  as?: 'div' | 'section' | 'header' | 'footer' | 'nav'
}

export function GlassSurface({
  children,
  className = '',
  variant = 'panel',
  tone = 'default',
  style,
  as: Tag = 'div',
}: GlassSurfaceProps) {
  const variantClass =
    variant === 'capsule'
      ? 'glass-capsule'
      : variant === 'panel'
        ? 'glass-panel'
        : ''

  const toneClass =
    tone === 'subtle'
      ? 'glass-surface--subtle'
      : tone === 'taskbar'
        ? 'glass-surface--taskbar'
        : tone === 'chrome'
          ? 'glass-surface--chrome'
          : tone === 'glassy'
            ? 'glass-surface--glassy'
            : ''

  return (
    <Tag
      className={`glass-surface ${variantClass} ${toneClass} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  )
}
