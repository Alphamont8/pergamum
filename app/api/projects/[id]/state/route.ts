import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth/session'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params
  const { supabase, user } = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()

  const { error } = await supabase.from('project_state').upsert({
    project_id: projectId,
    blueprint: body.blueprint,
    outline: body.outline,
    draft: body.draft,
    sources: body.sources,
    citations: body.citations,
    workspace_context: body.workspace_context,
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId)

  return NextResponse.json({ ok: true })
}
