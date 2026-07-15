import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ schools: [] })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const service = await createServiceClient()
  const safe = q.replace(/[%_]/g, ' ').replace(/\s+/g, ' ').trim()
  if (safe.length < 2) return NextResponse.json({ schools: [] })

  const { data, error } = await service.rpc('search_schools', {
    search: safe,
    lim: 25,
  })

  if (error) {
    // Fallback if RPC is not migrated yet: name + domain ilike.
    const pattern = `%${safe}%`
    const fallback = await service
      .from('schools')
      .select('id, name, country')
      .or(`name.ilike.${pattern},domain.ilike.${pattern}`)
      .order('name')
      .limit(25)
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    return NextResponse.json({ schools: fallback.data ?? [] })
  }

  return NextResponse.json({ schools: data ?? [] })
}
