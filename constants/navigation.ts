import type { TabKind } from '../types'

export type AppNavId =
  | 'blueprint'
  | 'outline'
  | 'draft'
  | 'references'
  | 'export'
  | 'help'
  | 'home'
  | 'projects'
  | 'leaderboard'
  | 'settings'
  | 'billing'

export interface NavItemDef {
  id: AppNavId
  label: string
}

/** Flat workflow pages (no subpages). */
export const WORKFLOW_NAV: NavItemDef[] = [
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'outline', label: 'Outline' },
  { id: 'draft', label: 'Draft' },
  { id: 'references', label: 'References' },
  { id: 'export', label: 'Export' },
]

export const SIDEBAR_FOOTER_NAV: NavItemDef[] = [
  { id: 'help', label: 'Help' },
  { id: 'settings', label: 'Settings' },
]

export function navToTabKind(navId: AppNavId): TabKind | null {
  if (
    navId === 'home' ||
    navId === 'projects' ||
    navId === 'leaderboard' ||
    navId === 'settings' ||
    navId === 'billing' ||
    navId === 'help'
  ) {
    return null
  }
  if (navId === 'blueprint') return 'blueprint'
  if (navId === 'outline') return 'outline'
  if (navId === 'draft') return 'draft'
  if (navId === 'references') return 'references'
  if (navId === 'export') return 'export'
  return null
}

export function tabKindToDefaultNav(kind: TabKind): AppNavId {
  switch (kind) {
    case 'blueprint':
      return 'blueprint'
    case 'outline':
      return 'outline'
    case 'draft':
      return 'draft'
    case 'references':
      return 'references'
    case 'export':
      return 'export'
    default:
      return 'blueprint'
  }
}
