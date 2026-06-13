import { GUEST_STORAGE_PREFIX } from './constants'
import { createInitialEssayState } from '@/state/essayInitial'
import { essayToPersisted, persistedToEssay } from '@/lib/project-state'
import type { EssayState } from '@/types'

function storageKey(projectId: string) {
  return `${GUEST_STORAGE_PREFIX}${projectId}`
}

export function loadGuestEssay(projectId: string): EssayState {
  if (typeof window === 'undefined') return createInitialEssayState()
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return createInitialEssayState()
    const parsed = JSON.parse(raw) as ReturnType<typeof essayToPersisted>
    return persistedToEssay(parsed, projectId)
  } catch {
    return createInitialEssayState()
  }
}

export function saveGuestEssay(projectId: string, essay: EssayState): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(essayToPersisted(essay)))
  } catch {
    /* quota exceeded */
  }
}

export function clearGuestEssay(projectId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(storageKey(projectId))
}
