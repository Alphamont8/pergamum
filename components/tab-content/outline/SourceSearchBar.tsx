"use client"

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import './SourceSearchBar.css'

interface SourceSearchBarProps {
  disabled?: boolean
  searching?: boolean
  focusRequest?: number
  showResults?: boolean
  onSearch: (query: string) => void
  onDone?: () => void
}

export function SourceSearchBar({
  disabled,
  searching,
  focusRequest,
  showResults,
  onSearch,
  onDone,
}: SourceSearchBarProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!focusRequest) return
    inputRef.current?.focus()
    inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusRequest])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || disabled) return
    onSearch(trimmed)
  }

  const handleDone = () => {
    setQuery('')
    onDone?.()
  }

  return (
    <div className="source-search-bar">
      <div className="source-search-bar__header">
        <span className="bp-section-label">Search Sources</span>
        {showResults && onDone && (
          <button type="button" className="source-search-bar__done" onClick={handleDone}>
            Done
          </button>
        )}
      </div>
      <form className="source-search-bar__form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="search"
          className="source-search-bar__input bp-input"
          placeholder="Enter a topic to find sources…"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="source-search-icon-btn"
          disabled={disabled || searching || !query.trim()}
          aria-label="Search sources"
        >
          <Search size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </form>
      <p className="source-search-bar__status bp-hint">
        Search for sources and attach them to the active subpoint in the detailed view above.
      </p>
    </div>
  )
}
