/** Map platform / gateway failures to warm user-facing copy. */
export function humanizeApiErrorText(text: string, fallback: string): string {
  const trimmed = text.trim()
  if (!trimmed) return fallback

  if (/FUNCTION_INVOCATION_TIMEOUT/i.test(trimmed)) {
    return 'That took too long. Try again or shorten your draft.'
  }
  if (
    /FUNCTION_INVOCATION_FAILED/i.test(trimmed) ||
    /^an error occurred with your deployment/i.test(trimmed)
  ) {
    return "We couldn't finish that request. Try again in a moment."
  }

  return trimmed.length <= 400 ? trimmed : fallback
}

/** Read a failed API response body without assuming JSON. */
export async function readApiErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const text = await res.text().catch(() => '')
  const trimmed = text.trim()
  if (!trimmed) return fallback

  try {
    const data = JSON.parse(trimmed) as { error?: string; message?: string }
    const fromJson = data.error ?? data.message
    if (fromJson?.trim()) return humanizeApiErrorText(fromJson, fallback)
    return fallback
  } catch {
    return humanizeApiErrorText(trimmed, fallback)
  }
}

/** Parse an SSE `data:` payload; surfaces plain-text platform errors clearly. */
export function parseSseEventData(dataLine: string): Record<string, unknown> {
  const raw = dataLine.trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    if (/FUNCTION_INVOCATION_TIMEOUT/i.test(raw) || /^an error/i.test(raw)) {
      throw new Error(humanizeApiErrorText(raw, "We couldn't finish generating citations. Try again."))
    }
    throw new Error("We couldn't read the server response. Try again.")
  }
}
