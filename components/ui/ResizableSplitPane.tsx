'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import './ResizableSplitPane.css'

interface ResizableSplitPaneProps {
  left: ReactNode
  right: ReactNode
  /** Fraction of width for left pane (0–1). Default 0.5 */
  initialRatio?: number
  /** Minimum fraction for left pane (default 0.3) */
  minLeft?: number
  /** Minimum fraction for right pane (default 0.3) */
  minRight?: number
  className?: string
}

export function ResizableSplitPane({
  left,
  right,
  initialRatio = 0.5,
  minLeft = 0.3,
  minRight = 0.3,
  className = '',
}: ResizableSplitPaneProps) {
  const [ratio, setRatio] = useState(initialRatio)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const maxLeft = 1 - minRight

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const next = (e.clientX - rect.left) / rect.width
      setRatio(Math.max(minLeft, Math.min(maxLeft, next)))
    },
    [minLeft, maxLeft],
  )

  const onPointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, onPointerMove, onPointerUp])

  return (
    <div
      ref={containerRef}
      className={`resizable-split ${dragging ? 'resizable-split--dragging' : ''} ${className}`}
    >
      <div className="resizable-split__pane resizable-split__pane--left" style={{ flex: ratio }}>
        {left}
      </div>
      <div
        className="resizable-split__divider"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(ratio * 100)}
        onPointerDown={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
      />
      <div
        className="resizable-split__pane resizable-split__pane--right"
        style={{ flex: 1 - ratio }}
      >
        {right}
      </div>
    </div>
  )
}
