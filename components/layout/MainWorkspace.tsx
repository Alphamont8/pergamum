"use client"

import type { AppNavId } from '../../constants/navigation'
import type { EssayState, SubscriptionTier } from '../../types'
import { renderMainContent } from '../tabs/renderMainContent'
import type { EssayTabActions } from '../tabs/tabContentProps'
import './MainWorkspace.css'

interface MainWorkspaceProps {
  activeNavId: AppNavId
  essay: EssayState
  subscriptionTier: SubscriptionTier
  workflow: {
    blueprintApproved: boolean
    outlineReadyForDraft: boolean
    draftHasContent: boolean
    draftEverGenerated: boolean
    hasCitations: boolean
  }
  analyzing: boolean
  generatingOutline: boolean
  saving: boolean
  essayActions: EssayTabActions
}

export function MainWorkspace({
  activeNavId,
  essay,
  subscriptionTier,
  workflow,
  analyzing,
  generatingOutline,
  saving,
  essayActions,
}: MainWorkspaceProps) {
  return (
    <main className="main-workspace">
      <div className="main-workspace__panel">
        {renderMainContent({
          activeNavId,
          essay,
          subscriptionTier,
          workflow,
          analyzing,
          generatingOutline,
          saving,
          actions: essayActions,
        })}
      </div>
    </main>
  )
}
