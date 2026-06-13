"use client"

import { useEffect, useState } from 'react'
import { loadGuestEssay } from '@/lib/guest/storage'
import { ProjectWorkspace } from './ProjectWorkspace'
import type { EssayState } from '@/types'

interface GuestProjectWorkspaceProps {
  projectId: string
}

export function GuestProjectWorkspace({ projectId }: GuestProjectWorkspaceProps) {
  const [essay, setEssay] = useState<EssayState | null>(null)

  useEffect(() => {
    setEssay(loadGuestEssay(projectId))
  }, [projectId])

  if (!essay) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: '#6b7280',
        }}
      >
        Loading workspace…
      </div>
    )
  }

  return (
    <ProjectWorkspace
      projectId={projectId}
      projectTitle="Sample Essay"
      initialEssay={essay}
      subscriptionTier="Pro"
      isGuest
    />
  )
}
