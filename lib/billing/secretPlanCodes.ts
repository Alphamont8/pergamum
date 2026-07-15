import { createServiceClient } from '@/lib/supabase/server'
import type { PlanTier } from '@/types'
import { FREE_PLAN_TIER } from '@/lib/billing/plans'
import {
  grantManualMonthlyProSubscription,
  isFullMonthlyProCode,
} from '@/lib/billing/manualProSubscription'
import { clearActiveProFeaturesTrial, consumeProTrialOpportunity } from '@/lib/billing/proTrial'

export type SecretPlanAction = 'pro' | 'pro_monthly' | 'basic'

export function resolveSecretPlanCode(code: string): SecretPlanAction | null {
  const normalized = code.trim().toUpperCase()
  if (isFullMonthlyProCode(normalized)) return 'pro_monthly'
  const proCode = process.env.SECRET_PLAN_PRO_CODE?.trim().toUpperCase()
  const basicCode = process.env.SECRET_PLAN_BASIC_CODE?.trim().toUpperCase()
  if (!proCode && !basicCode) return null
  if (proCode && normalized === proCode) return 'pro'
  if (basicCode && normalized === basicCode) return 'basic'
  return null
}

export async function applySecretPlanCode(
  userId: string,
  action: SecretPlanAction,
): Promise<PlanTier> {
  if (action === 'pro_monthly') {
    await grantManualMonthlyProSubscription(userId)
    return 'pro'
  }

  const planTier: PlanTier = action === 'pro' ? 'pro' : FREE_PLAN_TIER
  const service = await createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      plan_tier: planTier,
      default_suggest_corrections: planTier === 'pro',
      ...(planTier === FREE_PLAN_TIER
        ? { pro_cites_balance: 0, pro_trial_ends_at: null }
        : {}),
    })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  if (planTier === 'pro') {
    await consumeProTrialOpportunity(userId)
    await clearActiveProFeaturesTrial(userId)
  }

  return planTier
}
