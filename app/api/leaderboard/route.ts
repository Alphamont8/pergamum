import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const FETCH_LIMIT = 500

export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'You need to sign in to do that.' }, { status: 401 })

  const scope = new URL(request.url).searchParams.get('scope') ?? 'global'
  const service = await createServiceClient()

  const { data: meRow } = await service
    .from('leaderboard_individuals')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (scope === 'global') {
    const { data: individuals } = await service
      .from('leaderboard_individuals')
      .select('*')
      .order('sentences_checked', { ascending: false })
      .limit(FETCH_LIMIT)
    return NextResponse.json({
      individuals: individuals ?? [],
      schools: [],
      me: meRow ?? null,
    })
  }

  if (scope === 'school') {
    const { data: profile } = await service
      .from('profiles')
      .select('school_id')
      .eq('id', user.id)
      .single()

    let individuals: unknown[] = []
    if (profile?.school_id) {
      const { data } = await service
        .from('leaderboard_individuals')
        .select('*')
        .eq('school_id', profile.school_id)
        .order('sentences_checked', { ascending: false })
        .limit(FETCH_LIMIT)
      individuals = data ?? []
    }

    const { data: school } = profile?.school_id
      ? await service.from('schools').select('name').eq('id', profile.school_id).maybeSingle()
      : { data: null }

    const { data: schools } = await service
      .from('leaderboard_schools')
      .select('*')
      .order('sentences_checked', { ascending: false })
      .limit(FETCH_LIMIT)

    return NextResponse.json({
      individuals,
      schools: schools ?? [],
      me: meRow ?? null,
      schoolName: school?.name ?? null,
      mySchoolId: profile?.school_id ?? null,
    })
  }

  // friends
  const { data: friendships } = await service
    .from('friendships')
    .select('user_a, user_b')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)

  const friendIds = new Set<string>([user.id])
  for (const f of friendships ?? []) {
    friendIds.add(f.user_a)
    friendIds.add(f.user_b)
  }

  const { data: individuals } = await service
    .from('leaderboard_individuals')
    .select('*')
    .in('user_id', [...friendIds])
    .order('sentences_checked', { ascending: false })
    .limit(FETCH_LIMIT)

  return NextResponse.json({
    individuals: individuals ?? [],
    schools: [],
    me: meRow ?? null,
  })
}
