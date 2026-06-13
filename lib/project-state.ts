import {
  createInitialEssayState,
  migrateBlueprint,
  migrateDraft,
  migrateOutlineNodes,
} from '@/state/essayInitial'
import type { EssayState } from '@/types'

export interface PersistedProjectState {
  blueprint: EssayState['blueprint']
  outline: EssayState['outline']
  draft: EssayState['draft']
  sources: EssayState['sources']
  citations: EssayState['citations']
  workspace_context: EssayState['workspaceContext']
}

export function essayToPersisted(essay: EssayState): PersistedProjectState {
  return {
    blueprint: essay.blueprint,
    outline: essay.outline,
    draft: essay.draft,
    sources: essay.sources,
    citations: essay.citations,
    workspace_context: essay.workspaceContext,
  }
}

export function persistedToEssay(
  row: Partial<PersistedProjectState> | null,
  _projectId?: string,
): EssayState {
  const base = createInitialEssayState()
  if (!row) return base

  return {
    blueprint: migrateBlueprint(row.blueprint),
    outline: row.outline
      ? {
          ...(row.outline as EssayState['outline']),
          nodes: migrateOutlineNodes((row.outline as EssayState['outline']).nodes ?? []),
        }
      : base.outline,
    draft: migrateDraft(row.draft),
    sources: (row.sources as EssayState['sources']) ?? base.sources,
    citations: (row.citations as EssayState['citations']) ?? base.citations,
    workspaceContext: {
      ...base.workspaceContext,
      ...(row.workspace_context as EssayState['workspaceContext']),
      activeNavId: base.workspaceContext.activeNavId,
    },
  }
}

export function mergeNavIntoEssay(essay: EssayState, activeNavId: string): EssayState {
  return {
    ...essay,
    workspaceContext: {
      ...essay.workspaceContext,
      activeNavId,
    },
  }
}
