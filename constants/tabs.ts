import type { TabKind } from '../types'

export const TAB_LABELS: Record<TabKind, string> = {
  blueprint: 'Blueprint',
  outline: 'Outline',
  draft: 'Draft',
  references: 'References',
  export: 'Export',
}

export const ALL_TAB_ORDER: TabKind[] = [
  'blueprint',
  'outline',
  'draft',
  'references',
  'export',
]
