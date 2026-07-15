const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Resolve a ledger reference_id to a generation id (handles retry composite refs). */
export function generationIdFromLedgerReference(
  referenceId: string | null | undefined,
): string | null {
  if (!referenceId?.trim()) return null
  const trimmed = referenceId.trim()
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase()
  const prefix = trimmed.split(':')[0]
  if (prefix && UUID_RE.test(prefix)) return prefix.toLowerCase()
  return null
}
