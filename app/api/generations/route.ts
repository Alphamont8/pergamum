import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  let query = supabase
    .from('generations')
    .select('id, title, status, created_at, cites_required, pinned, pinned_at')
    .eq('user_id', user.id)
    .in('status', ['completed', 'failed'])
    .order('pinned', { ascending: false })
    .order('pinned_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (q) {
    query = query.or(`title.ilike.%${q}%,essay_input.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []
  const ids = rows.map((g) => g.id)
  const countByGeneration = new Map<string, number>()

  if (ids.length > 0) {
    const { data: doneRows } = await supabase
      .from('generation_citations')
      .select('generation_id')
      .in('generation_id', ids)
      .eq('status', 'done')

    for (const row of doneRows ?? []) {
      const id = row.generation_id as string
      countByGeneration.set(id, (countByGeneration.get(id) ?? 0) + 1)
    }
  }

  const generations = rows.map((g) => ({
    ...g,
    citations_done: countByGeneration.get(g.id) ?? 0,
  }))

  return NextResponse.json({ generations })
}
