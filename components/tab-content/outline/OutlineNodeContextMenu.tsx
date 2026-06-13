"use client"

import { useEffect, useRef } from 'react'
import type { OutlineNode } from '../../../types'
import './OutlineNodeContextMenu.css'

interface OutlineNodeContextMenuProps {
  node: OutlineNode
  x: number
  y: number
  locked: boolean
  onClose: () => void
  onConvert: (nodeId: string) => void
  onFindSource: (nodeId: string) => void
  onDelete: (nodeId: string) => void
}

export function OutlineNodeContextMenu({
  node,
  x,
  y,
  locked,
  onClose,
  onConvert,
  onFindSource,
  onDelete,
}: OutlineNodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handlePointer)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handlePointer)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  if (locked || node.type === 'section') return null

  const convertLabel = node.type === 'point' ? 'Convert to Subpoint' : 'Convert to Point'

  return (
    <div
      ref={menuRef}
      className="outline-node-menu"
      style={{ top: y, left: x }}
      role="menu"
    >
      <button
        type="button"
        className="outline-node-menu__item"
        role="menuitem"
        onClick={() => {
          onConvert(node.id)
          onClose()
        }}
      >
        {convertLabel}
      </button>
      {node.type === 'subpoint' && (
        <button
          type="button"
          className="outline-node-menu__item"
          role="menuitem"
          onClick={() => {
            onFindSource(node.id)
            onClose()
          }}
        >
          Find Source
        </button>
      )}
      <button
        type="button"
        className="outline-node-menu__item outline-node-menu__item--danger"
        role="menuitem"
        onClick={() => {
          onDelete(node.id)
          onClose()
        }}
      >
        Delete
      </button>
    </div>
  )
}
