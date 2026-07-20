/** Normalize analysis reasoning for the Agent Feed. */
export function formatAnalysisReasoning(raw: string): string {
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // Normalize bullet-like lines into one sentence per line.
  text = text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*]\s+/, '').trim())
    .filter(Boolean)
    .join('\n')

  if (text.length > 520) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
    text = sentences.slice(0, 4).join(' ').trim()
    if (text.length > 520) text = `${text.slice(0, 517).trim()}…`
  }

  return text
}

const MISS_REASON_COPY: Record<string, string> = {
  'Source has no usable evidence text.':
    'The top candidates did not include enough text to verify support.',
  'No verified source supported the claim.':
    'None of the candidates clearly supported the claim.',
  'Source did not reliably support the sentence.':
    'The best candidate did not clearly support the sentence.',
  'Source failed second-pass verification.':
    'The closest match failed a second verification check.',
}

/** Humanize pipeline miss reasons for the Agent Feed. */
export function formatMissReason(raw?: string | null): string | null {
  if (!raw?.trim()) return null
  const trimmed = raw.trim()
  const mapped = MISS_REASON_COPY[trimmed]
  if (mapped) return mapped

  let text = trimmed.replace(/\s+/g, ' ')
  if (!/[.!?]$/.test(text)) text += '.'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatMissFeedMessage(sentenceIndex: number, reason?: string | null): string {
  const n = sentenceIndex + 1
  const detail = formatMissReason(reason)
  if (!detail) return `We couldn't find a solid match for Sentence ${n}.`
  return `No solid match for Sentence ${n} — ${detail}`
}
