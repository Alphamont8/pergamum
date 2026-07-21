import { handleAuthCallback } from '@/lib/supabase/auth-callback'
import { NextResponse, type NextRequest } from 'next/server'

/** Fallback if middleware matcher changes; primary handler is in middleware. */
export async function GET(request: NextRequest) {
  return handleAuthCallback(request)
}
