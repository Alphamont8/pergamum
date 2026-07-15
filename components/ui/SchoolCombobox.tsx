'use client'

import { useEffect, useId, useRef, useState } from 'react'
import './ui.css'

export interface SchoolOption {
  id: string
  name: string
  country: string | null
}

interface SchoolComboboxProps {
  label?: string
  valueId: string | null
  displayValue: string
  onDisplayChange: (value: string) => void
  onSelect: (school: SchoolOption) => void
  onClear: () => void
  placeholder?: string
}

function formatSchool(s: SchoolOption) {
  return s.country ? `${s.name} · ${s.country}` : s.name
}

export function SchoolCombobox({
  label = 'University',
  valueId,
  displayValue,
  onDisplayChange,
  onSelect,
  onClear,
  placeholder = 'Search universities…',
}: SchoolComboboxProps) {
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const inputId = useId()

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

  useEffect(() => {
    const q = displayValue.trim()
    if (valueId || q.length < 2) {
      setSchools([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/schools?q=${encodeURIComponent(q)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setSchools([])
          setError(typeof data.error === 'string' ? data.error : 'We couldn\u2019t search universities.')
          setOpen(true)
          return
        }
        const next = (data.schools ?? []) as SchoolOption[]
        setSchools(next)
        setOpen(true)
      } catch {
        if (!cancelled) {
          setSchools([])
          setError('We couldn\u2019t search universities.')
          setOpen(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [displayValue, valueId])

  return (
    <div className="pg-combobox" ref={rootRef}>
      {label ? (
        <label className="pg-combobox__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="pg-combobox__field">
        <input
          id={inputId}
          value={displayValue}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          onFocus={() => {
            if (!valueId && (schools.length > 0 || displayValue.trim().length >= 2)) setOpen(true)
          }}
          onChange={(e) => {
            onClear()
            onDisplayChange(e.target.value)
            setOpen(true)
          }}
        />
        {valueId ? (
          <button
            type="button"
            className="pg-combobox__clear"
            aria-label="Clear university"
            onClick={() => {
              onClear()
              onDisplayChange('')
              setSchools([])
              setOpen(false)
            }}
          >
            Clear
          </button>
        ) : null}
      </div>

      {open && !valueId && displayValue.trim().length >= 2 ? (
        <ul id={listId} role="listbox" className="pg-combobox__menu">
          {loading ? <li className="pg-combobox__empty">Searching…</li> : null}
          {!loading && error ? <li className="pg-combobox__empty is-error">{error}</li> : null}
          {!loading && !error && schools.length === 0 ? (
            <li className="pg-combobox__empty">No universities match “{displayValue.trim()}”</li>
          ) : null}
          {!loading &&
            schools.map((s) => (
              <li key={s.id} role="option">
                <button
                  type="button"
                  className="pg-combobox__option"
                  onClick={() => {
                    onSelect(s)
                    onDisplayChange(formatSchool(s))
                    setSchools([])
                    setOpen(false)
                  }}
                >
                  <strong>{s.name}</strong>
                  {s.country ? <span>{s.country}</span> : null}
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}
