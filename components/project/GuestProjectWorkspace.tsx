"use client"

import { useEffect, useState } from 'react'
import { clearGuestEssay } from '@/lib/guest/storage'
import { createInitialEssayState } from '@/state/essayInitial'
import { ProjectWorkspace } from './ProjectWorkspace'
import type { EssayState } from '@/types'

interface GuestProjectWorkspaceProps {
  projectId: string
}

export function GuestProjectWorkspace({ projectId }: GuestProjectWorkspaceProps) {
  const [essay, setEssay] = useState<EssayState | null>(null)

  useEffect(() => {
    clearGuestEssay(projectId)
    setEssay(createInitialEssayState())
  }, [projectId])

  if (!essay) {
    return <div className="auth-page">Loading workspace…</div>
  }

  return (
    <ProjectWorkspace
      projectId={projectId}
      projectTitle="Sample Essay"
      initialEssay={essay}
      subscriptionTier="Basic"
      isGuest
    />
  )
}
