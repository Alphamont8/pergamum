import { handleAuthCallback } from '@/lib/supabase/auth-callback'
import type { NextRequest } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  return handleAuthCallback(request)
}
