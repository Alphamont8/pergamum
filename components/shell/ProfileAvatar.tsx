'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { avatarUrlFromUserMetadata, syncProfileAvatarIfMissing } from '@/lib/auth/avatar'

export function ProfileAvatar({
  userId,
  avatarUrl,
  initials,
}: {
  userId: string
  avatarUrl: string | null
  initials: string
}) {
  const supabase = useMemo(() => createClient(), [])
  const [src, setSrc] = useState(avatarUrl?.trim() || null)
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setSrc(avatarUrl?.trim() || null)
    setBroken(false)
  }, [avatarUrl])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (src && !broken) return

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user || user.id !== userId) return

      const fromAuth = avatarUrlFromUserMetadata(user.user_metadata)
      if (!fromAuth) return

      setSrc(fromAuth)
      setBroken(false)

      if (!avatarUrl?.trim()) {
        await syncProfileAvatarIfMissing(supabase, userId, user.user_metadata)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [avatarUrl, broken, src, supabase, userId])

  const handleImageError = () => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.id !== userId) {
        setBroken(true)
        return
      }

      const fromAuth = avatarUrlFromUserMetadata(user.user_metadata)
      if (fromAuth && fromAuth !== src) {
        setSrc(fromAuth)
        setBroken(false)
        await supabase
          .from('profiles')
          .update({
            avatar_url: fromAuth,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
        return
      }

      setBroken(true)
    })()
  }

  if (!src || broken) {
    return <span className="avatar avatar--fallback">{initials}</span>
  }

  return (
    <img
      src={src}
      alt=""
      className="avatar"
      referrerPolicy="no-referrer"
      onError={handleImageError}
    />
  )
}
