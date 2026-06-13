import { NextResponse } from 'next/server'
import { GUEST_COOKIE } from '@/lib/guest/constants'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(GUEST_COOKIE, '', {
    path: '/',
    maxAge: 0,
  })
  return response
}
