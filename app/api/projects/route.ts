import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'
import { createInitialEssayState } from '@/state/essayInitial'

export async function GET() {
  const { supabase, user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data })
}

export async function POST(request: Request) {
  const { supabase, user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const title = (body.title as string) || 'Untitled Essay'

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, title })
    .select('id, title, created_at, updated_at')
    .single()

  if (error || !project) {
    return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })
  }

  const initial = createInitialEssayState()
  await supabase.from('project_state').insert({
    project_id: project.id,
    blueprint: initial.blueprint,
    outline: initial.outline,
    draft: initial.draft,
    sources: initial.sources,
    citations: initial.citations,
    workspace_context: initial.workspaceContext,
  })

  return NextResponse.json({ project })
}
