import { NextResponse } from 'next/server'
import { GUEST_COOKIE, GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'

export async function POST() {
  const response = NextResponse.json({
    redirect: `/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`,
  })

  response.cookies.set(GUEST_COOKIE, '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
