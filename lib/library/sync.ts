import { formatAppDate, formatAppDateTime } from '@/lib/format/date'

export type LibrarySyncDetail =
  | { action: 'title'; id: string; title: string }
  | { action: 'pin'; id: string; pinned: boolean; pinnedAt: string | null }
  | { action: 'delete'; id: string }
  | { action: 'refresh' }

export const LIBRARY_SYNC_EVENT = 'pergamum:library-sync'

export function dispatchLibrarySync(detail: LibrarySyncDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<LibrarySyncDetail>(LIBRARY_SYNC_EVENT, { detail }))
}

export interface GenerationListItem {
  id: string
  title: string | null
  status: string
  created_at: string
  cites_required: number
  citations_done: number
  pinned?: boolean
  pinned_at?: string | null
}

export function sortGenerations(items: GenerationListItem[]): GenerationListItem[] {
  return [...items].sort((a, b) => {
    const aPinned = Boolean(a.pinned)
    const bPinned = Boolean(b.pinned)
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    if (aPinned && bPinned) {
      const pa = a.pinned_at ? new Date(a.pinned_at).getTime() : 0
      const pb = b.pinned_at ? new Date(b.pinned_at).getTime() : 0
      if (pa !== pb) return pa - pb
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export function formatCitationLabel(count: number): string {
  return count === 1 ? '1 Citation' : `${count} Citations`
}

export function countSuccessfulCitations(
  citations?: Array<{ status?: string }> | null,
): number {
  return citations?.filter((c) => c.status === 'done').length ?? 0
}

export function formatListMeta(createdAt: string, citationsDone: number): string {
  const datePart = formatAppDate(createdAt)
  return `${datePart} · ${formatCitationLabel(citationsDone)}`
}

export function formatDraftMeta(
  createdAt: string,
  citationsDone: number,
  styleLabel?: string | null,
): string {
  const parts = [formatAppDateTime(createdAt), formatCitationLabel(citationsDone)]
  if (styleLabel?.trim()) parts.push(styleLabel.trim())
  return parts.join(' · ')
}
