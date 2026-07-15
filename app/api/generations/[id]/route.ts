import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ensureGenerationTitle } from '@/lib/essay/title'

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
})

const generationColumns =
  'id, title, essay_input, status, cites_required, cites_spent, pinned, pinned_at, result, sentences, settings, progress, created_at, error_message'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const { data, error } = await supabase
    .from('generations')
    .select(generationColumns)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "We couldn't find that." }, { status: 404 })

  if (data.essay_input) {
    const service = await createServiceClient()
    const title = await ensureGenerationTitle(
      service,
      data.id,
      data.essay_input,
      data.title,
    )
    if (title !== data.title) {
      data.title = title
    }
  }

  return NextResponse.json({ generation: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "That request wasn't valid." }, { status: 400 })
  }

  const updates: {
    title?: string
    pinned?: boolean
    pinned_at?: string | null
    updated_at?: string
  } = {}
  if (parsed.data.title !== undefined) updates.title = parsed.data.title
  if (parsed.data.pinned !== undefined) {
    updates.pinned = parsed.data.pinned
    updates.pinned_at = parsed.data.pinned ? new Date().toISOString() : null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'There was nothing to update.' }, { status: 400 })
  }
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('generations')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, title, pinned, pinned_at, status, created_at, cites_required')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "We couldn't find that." }, { status: 404 })
  return NextResponse.json({ generation: data })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const { error } = await supabase
    .from('generations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
