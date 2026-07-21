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
    return data.error ?? data.message ?? fallback
  } catch {
    return trimmed.length <= 400 ? trimmed : fallback
  }
}

/** Parse an SSE `data:` payload; surfaces plain-text platform errors clearly. */
export function parseSseEventData(dataLine: string): Record<string, unknown> {
  const raw = dataLine.trim()
  if (!raw) return {}

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    if (/^an error/i.test(raw)) {
      throw new Error(raw)
    }
    throw new Error("We couldn't read the server response. Try again.")
  }
}
