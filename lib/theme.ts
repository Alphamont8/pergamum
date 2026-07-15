import type { ThemePreference } from '@/types'

export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'pergamum-theme'

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'system' || stored === 'light' || stored === 'dark') return stored
  return 'system'
}

export function writeThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref)
  } catch {
    /* storage unavailable */
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref === 'dark' ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }
  writeThemePreference(pref)
  return resolved
}

export function themePreferenceLabel(pref: ThemePreference): string {
  if (pref === 'system') return 'System'
  if (pref === 'light') return 'Light'
  return 'Dark'
}
