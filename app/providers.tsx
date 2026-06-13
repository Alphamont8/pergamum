"use client"

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

// ── Scroll-boundary bounce ────────────────────────────────────────────────────

const BOUNCE_TOP    = 'scroll-bounce-top'
const BOUNCE_BOTTOM = 'scroll-bounce-bottom'
const ANIM_MS = 460 // slightly longer than the CSS animation so the class outlives it

// Cache: event target → nearest scrollable ancestor.
// WeakMap entries are GC'd automatically when targets are removed from the DOM.
const ancestorCache = new WeakMap<Element, Element | null>()

function findScrollableAncestor(start: Element): Element | null {
  let node: Element | null = start
  while (node && node !== document.documentElement) {
    const { overflowY, overflow } = getComputedStyle(node)
    if (
      (overflowY === 'auto' || overflowY === 'scroll' ||
       overflow  === 'auto' || overflow  === 'scroll') &&
      node.scrollHeight > node.clientHeight
    ) return node
    node = node.parentElement
  }
  return null
}

type BounceState = {
  cleanupTimer: ReturnType<typeof setTimeout> | null
  // The edge that last bounced. A bounce only fires when the current edge
  // differs from this — so an edge bounces exactly once, and won't bounce
  // again until the user reaches the OPPOSITE end.
  lastBouncedEdge: 'top' | 'bottom' | null
}

const bounceStates = new WeakMap<Element, BounceState>()

function getState(el: Element): BounceState {
  let s = bounceStates.get(el)
  if (!s) {
    s = { cleanupTimer: null, lastBouncedEdge: null }
    bounceStates.set(el, s)
  }
  return s
}

function playBounce(el: HTMLElement, edge: 'top' | 'bottom') {
  const state = getState(el)
  const cls = edge === 'top' ? BOUNCE_TOP : BOUNCE_BOTTOM

  if (state.cleanupTimer != null) clearTimeout(state.cleanupTimer)

  // Clean restart within a single paint cycle (remove → flush → add).
  el.classList.remove(BOUNCE_TOP, BOUNCE_BOTTOM)
  void el.offsetHeight
  el.classList.add(cls)

  state.cleanupTimer = setTimeout(() => {
    el.classList.remove(cls)
    state.cleanupTimer = null
  }, ANIM_MS)
}

function ScrollBounce() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      if (!target) return

      // Serve from cache; re-walk only when the cached element is no longer scrollable.
      let cached = ancestorCache.get(target)
      if (cached === undefined) {
        cached = findScrollableAncestor(target)
        ancestorCache.set(target, cached)
      } else if (cached !== null && cached.scrollHeight <= cached.clientHeight) {
        cached = findScrollableAncestor(target)
        ancestorCache.set(target, cached)
      }
      const el = cached
      if (!el) return

      const state = getState(el)
      const atTop    = el.scrollTop <= 0 && e.deltaY < 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0
      if (!atTop && !atBottom) return

      const edge: 'top' | 'bottom' = atTop ? 'top' : 'bottom'

      // Bounce exactly once per edge. Re-arm only when the opposite edge is hit.
      if (state.lastBouncedEdge === edge) return

      state.lastBouncedEdge = edge
      playBounce(el as HTMLElement, edge)
    }

    window.addEventListener('wheel', onWheel, { passive: true })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  return null
}

// ─────────────────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <ScrollBounce />
      {children}
    </QueryClientProvider>
  )
}
