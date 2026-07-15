import { createServiceClient } from '@/lib/supabase/server'
import type { CiteLedgerKind } from '@/types'

export async function getReferralReward(): Promise<number> {
  const service = await createServiceClient()
  const { data } = await service
    .from('reward_config')
    .select('value')
    .eq('key', 'referral_cites')
    .maybeSingle()
  const raw = data?.value
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 50
}

/** Credit Cites only via ledger (service role). Never update cites_balance directly from APIs. */
export async function creditCites(input: {
  userId: string
  delta: number
  kind: CiteLedgerKind
  referenceId?: string
  note?: string
}) {
  if (input.delta === 0) return
  const service = await createServiceClient()
  const { error } = await service.from('cites_ledger').insert({
    user_id: input.userId,
    delta: input.delta,
    kind: input.kind,
    reference_id: input.referenceId ?? null,
    note: input.note ?? null,
  })
  if (error) throw new Error(error.message)
}

/** Billing credits use a unique ledger reference so webhook retries cannot double-credit. */
export async function creditCitesOnce(input: {
  userId: string
  delta: number
  kind: Extract<CiteLedgerKind, 'purchase' | 'subscription'>
  referenceId: string
  note?: string
}): Promise<boolean> {
  if (input.delta === 0) return false
  const service = await createServiceClient()
  const { error } = await service.from('cites_ledger').insert({
    user_id: input.userId,
    delta: input.delta,
    kind: input.kind,
    reference_id: input.referenceId,
    note: input.note ?? null,
  })
  if (!error) return true
  if (error.code === '23505') return false
  throw new Error(error.message)
}

export async function creditGuestCites(input: {
  guestSessionId: string
  delta: number
  kind: 'ad' | 'spend' | 'grant'
  referenceId?: string
  note?: string
}) {
  if (input.delta === 0) return
  const service = await createServiceClient()
  const { error } = await service.from('guest_cites_ledger').insert({
    guest_session_id: input.guestSessionId,
    delta: input.delta,
    kind: input.kind,
    reference_id: input.referenceId ?? null,
    note: input.note ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function getUserCitesBalance(userId: string): Promise<number> {
  const service = await createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('cites_balance, pro_cites_balance')
    .eq('id', userId)
    .single()
  return Number(data?.cites_balance ?? 0) + Number(data?.pro_cites_balance ?? 0)
}

/** Permanent pack/referral/grant pool (never expires). */
export async function getPermanentCitesBalance(userId: string): Promise<number> {
  const service = await createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('cites_balance')
    .eq('id', userId)
    .single()
  return Number(data?.cites_balance ?? 0)
}

/** Remaining Pro monthly allotment (resets each grant; clears when Pro ends). */
export async function getProCitesBalance(userId: string): Promise<number> {
  const service = await createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('pro_cites_balance')
    .eq('id', userId)
    .single()
  return Number(data?.pro_cites_balance ?? 0)
}
