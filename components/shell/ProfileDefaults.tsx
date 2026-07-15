'use client'

import { createContext, useContext } from 'react'
import { FREE_PLAN_TIER } from '@/lib/billing/plans'
import type { PlanTier, SourceRecency, SourceTier } from '@/types'

export interface ProfileDefaults {
  userId: string
  defaultStyle: string
  defaultInText: boolean
  defaultSuggestCorrections: boolean
  defaultRecency: SourceRecency
  defaultSourceTier: SourceTier
  planTier: PlanTier
}

const ProfileDefaultsContext = createContext<ProfileDefaults>({
  userId: '',
  defaultStyle: 'apa',
  defaultInText: true,
  defaultSuggestCorrections: false,
  defaultRecency: 'any',
  defaultSourceTier: 'any',
  planTier: FREE_PLAN_TIER,
})

export function ProfileDefaultsProvider({
  defaults,
  children,
}: {
  defaults: ProfileDefaults
  children: React.ReactNode
}) {
  return (
    <ProfileDefaultsContext.Provider value={defaults}>{children}</ProfileDefaultsContext.Provider>
  )
}

export function useProfileDefaults() {
  return useContext(ProfileDefaultsContext)
}
