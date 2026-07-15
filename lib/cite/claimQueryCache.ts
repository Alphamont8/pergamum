import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/server'

/** Mirrors ClaimQuery without importing analyze (avoids circular deps). */
export interface ClaimQueryPayload {
  claim: string
  keywords: string[]
  entities: string[]
  dataPoints: string[]
  academicQuery: string
  webQuery: string
  embeddingFocus: string
}

const MEMORY_MAX = 200
const memory = new Map<string, ClaimQueryPayload>()

/** TTL for DB rows — 30 days. */
const DB_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function hashSentence(sentence: string): string {
  return createHash('sha256').update(sentence.trim()).digest('hex')
}

function rememberMemory(key: string, value: ClaimQueryPayload): ClaimQueryPayload {
  if (memory.size >= MEMORY_MAX) {
    const oldest = memory.keys().next().value
    if (oldest) memory.delete(oldest)
  }
  memory.set(key, value)
  return value
}

export function getClaimQueryFromMemory(sentence: string): ClaimQueryPayload | null {
  return memory.get(hashSentence(sentence)) ?? null
}

export function putClaimQueryInMemory(sentence: string, value: ClaimQueryPayload): ClaimQueryPayload {
  return rememberMemory(hashSentence(sentence), value)
}

/** Seed memory from analyze-time claim fields (no LLM). */
export function seedClaimQuery(sentence: string, value: ClaimQueryPayload): void {
  putClaimQueryInMemory(sentence, value)
}

/**
 * Look up claim query: in-memory first, then Supabase claim_query_cache.
 * Best-effort — DB failures fall through to caller LLM.
 */
export async function getCachedClaimQuery(sentence: string): Promise<ClaimQueryPayload | null> {
  const key = hashSentence(sentence)
  const mem = memory.get(key)
  if (mem) return mem

  try {
    const service = await createServiceClient()
    const { data } = await service
      .from('claim_query_cache')
      .select('payload, updated_at')
      .eq('sentence_hash', key)
      .maybeSingle()

    if (!data?.payload) return null
    const updatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0
    if (updatedAt && Date.now() - updatedAt > DB_TTL_MS) return null

    const payload = data.payload as ClaimQueryPayload
    if (!payload?.claim || !payload?.academicQuery || !payload?.webQuery) return null
    return rememberMemory(key, payload)
  } catch {
    return null
  }
}

/** Persist claim query to memory + DB (fire-and-forget safe). */
export async function putCachedClaimQuery(
  sentence: string,
  value: ClaimQueryPayload,
): Promise<ClaimQueryPayload> {
  const key = hashSentence(sentence)
  rememberMemory(key, value)

  try {
    const service = await createServiceClient()
    await service.from('claim_query_cache').upsert(
      {
        sentence_hash: key,
        payload: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sentence_hash' },
    )
  } catch {
    /* best-effort */
  }

  return value
}
