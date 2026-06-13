import { NextResponse } from 'next/server'
import { getApiAuth } from '@/lib/auth/context'
import { getUsageSummary } from '@/lib/ai/usage'

export async function GET() {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const summary = await getUsageSummary(auth)
  return NextResponse.json(summary)
}
