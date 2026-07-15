'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import './ui.css'

interface MenuContextValue {
  open: boolean
  setOpen: (v: boolean) => void
  menuId: string
}

const MenuContext = createContext<MenuContextValue | null>(null)

export function Menu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <MenuContext.Provider value={{ open, setOpen, menuId }}>
      <div className="pg-menu" ref={rootRef}>
        {children}
      </div>
    </MenuContext.Provider>
  )
}

export function MenuTrigger({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('MenuTrigger requires Menu')
  return (
    <button
      type="button"
      className={`pg-menu__trigger ${className}`.trim()}
      aria-haspopup="menu"
      aria-expanded={ctx.open}
      aria-controls={ctx.menuId}
      onClick={() => ctx.setOpen(!ctx.open)}
    >
      {children}
    </button>
  )
}

export function MenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  const ctx = useContext(MenuContext)
  if (!ctx) throw new Error('MenuContent requires Menu')
  if (!ctx.open) return null
  return (
    <div
      id={ctx.menuId}
      role="menu"
      className={`pg-menu__content pg-menu__content--${align}`}
    >
      {children}
    </div>
  )
}

export function MenuItem({
  children,
  onSelect,
  danger,
}: {
  children: ReactNode
  onSelect?: () => void
  danger?: boolean
}) {
  const ctx = useContext(MenuContext)
  const close = useCallback(() => ctx?.setOpen(false), [ctx])
  return (
    <button
      type="button"
      role="menuitem"
      className={`pg-menu__item ${danger ? 'is-danger' : ''}`.trim()}
      onClick={() => {
        onSelect?.()
        close()
      }}
    >
      {children}
    </button>
  )
}
