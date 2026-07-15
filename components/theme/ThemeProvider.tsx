'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ThemePreference } from '@/types'
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  type ResolvedTheme,
} from '@/lib/theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<ResolvedTheme>('light')

  useEffect(() => {
    const pref = readThemePreference()
    setPreferenceState(pref)
    setResolved(applyTheme(pref))
  }, [])

  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(applyTheme('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref)
    setResolved(applyTheme(pref))
  }, [])

  const value = useMemo(
    () => ({ preference, resolved: resolveTheme(preference) || resolved, setPreference }),
    [preference, resolved, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
