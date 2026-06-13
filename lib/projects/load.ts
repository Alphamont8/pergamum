import { createClient } from '@/lib/supabase/server'
import { createInitialEssayState } from '@/state/essayInitial'
import { persistedToEssay } from '@/lib/project-state'
import type { EssayState } from '@/types'

export interface ProjectRow {
  id: string
  title: string
  user_id: string
}

export async function loadProjectBundle(projectId: string, userId: string) {
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, user_id')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()

  if (projectError || !project) return null

  const typedProject = project as ProjectRow

  const { data: stateRow } = await supabase
    .from('project_state')
    .select('*')
    .eq('project_id', projectId)
    .single()

  const essay: EssayState = persistedToEssay(
    stateRow
      ? {
          blueprint: stateRow.blueprint,
          outline: stateRow.outline,
          draft: stateRow.draft,
          sources: stateRow.sources,
          citations: stateRow.citations,
          workspace_context: stateRow.workspace_context,
        }
      : null,
    projectId,
  )

  if (!stateRow) {
    const initial = createInitialEssayState()
    await supabase.from('project_state').insert({
      project_id: projectId,
      blueprint: initial.blueprint,
      outline: initial.outline,
      draft: initial.draft,
      sources: initial.sources,
      citations: initial.citations,
      workspace_context: initial.workspaceContext,
    })
  }

  return { project: typedProject, essay }
}
