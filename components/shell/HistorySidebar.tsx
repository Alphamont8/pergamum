'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import '@/components/ui/ui.css'
import { useLibrary } from '@/components/shell/LibraryContext'
import { useProfileDefaults } from '@/components/shell/ProfileDefaults'
import { clearComposerDraft, dispatchComposerClear } from '@/lib/composer/draft'
import { formatListMeta } from '@/lib/library/sync'

export function LibrarySidebar({ open }: { open: boolean }) {
  const pathname = usePathname()
  const { generations, loading, closeLibrary } = useLibrary()
  const { userId } = useProfileDefaults()
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return generations
    return generations.filter((item) => (item.title || 'untitled draft').toLowerCase().includes(q))
  }, [generations, query])

  const startNewDraft = () => {
    clearComposerDraft(userId)
    dispatchComposerClear()
    closeLibrary()
  }

  return (
    <aside className={`history-sidebar ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <div className="history-search">
        <div className="history-search__field">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drafts…"
            aria-label="Search drafts"
          />
          {query ? (
            <button
              type="button"
              className="history-search__clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <Link href="/" className="pg-btn pg-btn--accent pg-btn--md history-new" onClick={startNewDraft}>
        New Draft
      </Link>
      <hr className="history-divider" />
      <div className="history-list">
        {loading ? <p className="pg-loading">Loading…</p> : null}
        {!loading && !filtered.length ? (
          <p className="pg-subtle history-list__empty">
            {query.trim() ? 'No drafts match that search.' : 'No drafts yet.'}
          </p>
        ) : null}
        {!loading
          ? filtered.map((item) => (
              <Link
                key={item.id}
                href={`/c/${item.id}`}
                className={`history-item ${pathname === `/c/${item.id}` ? 'is-active' : ''} ${
                  item.status === 'failed' ? 'is-failed' : ''
                }`}
              >
                <span className="history-item__title">{item.title || 'Untitled draft'}</span>
                <span className="history-item__meta">
                  {formatListMeta(item.created_at, item.citations_done)}
                  {item.status === 'failed' ? (
                    <>
                      {' · '}
                      <span className="history-item__failed">Failed</span>
                    </>
                  ) : null}
                  {item.pinned ? (
                    <>
                      {' · '}
                      <span className="history-item__pinned">Pinned</span>
                    </>
                  ) : null}
                </span>
              </Link>
            ))
          : null}
      </div>
    </aside>
  )
}
