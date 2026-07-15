import { NextResponse } from 'next/server'
import { getOrCreateGuestSession } from '@/lib/guest/session'

export async function GET() {
  try {
    const guest = await getOrCreateGuestSession()
    return NextResponse.json({
      id: guest.id,
      citesBalance: guest.citesBalance,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Guest sessions aren't available right now." },
      { status: 503 },
    )
  }
}
