import type { SupabaseClient } from '@supabase/supabase-js'

/** OAuth providers store the photo under different metadata keys. */
export function avatarUrlFromUserMetadata(
  metadata: Record<string, unknown> | undefined | null,
): string | null {
  if (!metadata) return null
  for (const key of ['avatar_url', 'picture', 'avatar']) {
    const raw = metadata[key]
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      if (trimmed) return trimmed
    }
  }
  return null
}

function isMissingAvatarUrl(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

/**
 * Persist auth metadata photo to profiles when the row has no avatar yet.
 * Safe to call on every login / profile load.
 */
export async function syncProfileAvatarIfMissing(
  client: SupabaseClient,
  userId: string,
  metadata: Record<string, unknown> | undefined | null,
): Promise<string | null> {
  const fromAuth = avatarUrlFromUserMetadata(metadata)
  if (!fromAuth) return null

  const { data: profile } = await client
    .from('profiles')
    .select('avatar_url')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) return null
  if (!isMissingAvatarUrl(profile.avatar_url)) {
    return String(profile.avatar_url).trim()
  }

  const { error } = await client
    .from('profiles')
    .update({
      avatar_url: fromAuth,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) {
    console.warn('[avatar] profile sync failed', error.message)
    return fromAuth
  }

  return fromAuth
}
