'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  LIBRARY_SYNC_EVENT,
  type GenerationListItem,
  type LibrarySyncDetail,
  sortGenerations,
} from '@/lib/library/sync'

const LIBRARY_KEY = 'pergamum-library-open'

function persistLibraryOpen(open: boolean) {
  try {
    localStorage.setItem(LIBRARY_KEY, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

interface LibraryContextValue {
  generations: GenerationListItem[]
  loading: boolean
  sidebarOpen: boolean
  refreshGenerations: () => Promise<GenerationListItem[]>
  openLibrary: () => void
  closeLibrary: () => void
  toggleLibrary: () => void
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [generations, setGenerations] = useState<GenerationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const refreshGenerations = useCallback(async () => {
    const res = await fetch('/api/generations', { cache: 'no-store' })
    if (res.status === 401) {
      setLoading(false)
      if (typeof window !== 'undefined') {
        window.location.assign(
          `/login?redirect=${encodeURIComponent(window.location.pathname)}&error=session`,
        )
      }
      return []
    }
    if (!res.ok) {
      setLoading(false)
      return []
    }
    const data = (await res.json()) as { generations: GenerationListItem[] }
    const sorted = sortGenerations(data.generations ?? [])
    setGenerations(sorted)
    setLoading(false)
    return sorted
  }, [])

  const openLibrary = useCallback(() => {
    setSidebarOpen(true)
    persistLibraryOpen(true)
  }, [])

  const closeLibrary = useCallback(() => {
    setSidebarOpen(false)
    persistLibraryOpen(false)
  }, [])

  const toggleLibrary = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open
      persistLibraryOpen(next)
      return next
    })
  }, [])

  useEffect(() => {
    void refreshGenerations()
  }, [refreshGenerations])

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<LibrarySyncDetail>).detail
      if (!detail) return

      if (detail.action === 'refresh') {
        void refreshGenerations()
        return
      }

      setGenerations((prev) => {
        if (detail.action === 'delete') {
          return sortGenerations(prev.filter((g) => g.id !== detail.id))
        }
        if (detail.action === 'title') {
          return sortGenerations(
            prev.map((g) => (g.id === detail.id ? { ...g, title: detail.title } : g)),
          )
        }
        if (detail.action === 'pin') {
          return sortGenerations(
            prev.map((g) =>
              g.id === detail.id
                ? { ...g, pinned: detail.pinned, pinned_at: detail.pinnedAt }
                : g,
            ),
          )
        }
        return prev
      })
    }

    window.addEventListener(LIBRARY_SYNC_EVENT, onSync)
    return () => window.removeEventListener(LIBRARY_SYNC_EVENT, onSync)
  }, [refreshGenerations])

  const value = useMemo(
    () => ({
      generations,
      loading,
      sidebarOpen,
      refreshGenerations,
      openLibrary,
      closeLibrary,
      toggleLibrary,
    }),
    [
      generations,
      loading,
      sidebarOpen,
      refreshGenerations,
      openLibrary,
      closeLibrary,
      toggleLibrary,
    ],
  )

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider')
  return ctx
}

/** Safe outside AppShell (e.g. public legal pages). */
export function useLibraryOptional() {
  return useContext(LibraryContext)
}
