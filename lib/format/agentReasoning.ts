/** Normalize analysis reasoning for the Citation Feed. */
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

/** True when reasoning clearly says no citations / no citable sentences. */
function reasoningDeniesCitations(reasoning: string): boolean {
  return (
    /\b(no|zero|none|without|not)\b[\s\S]{0,24}\b(citation|citable|sentence|claim)/i.test(reasoning) ||
    /\b(does not|do not|don't|didn't|need not|no need to)\b[\s\S]{0,40}\b(citation|cite)/i.test(
      reasoning,
    ) ||
    /\b(opinion|reflection|personal)\b[\s\S]{0,40}\b(no|without|none)\b[\s\S]{0,24}\b(citation|fact)/i.test(
      reasoning,
    ) ||
    /\bskip(?:ped|ping)?\s+all\b/i.test(reasoning) ||
    /\bempty\s+list\b/i.test(reasoning)
  )
}

/** True when model reasoning describes selected claims but the sentence list is empty. */
export function reasoningImpliesCitations(reasoning: string): boolean {
  const r = reasoning.trim()
  if (!r) return false
  if (isIncompleteAnalysisReasoning(r)) return true
  // Negations like "No sentences require citations" must not trigger a hard fail.
  if (reasoningDeniesCitations(r)) return false
  return (
    /\b(selected|found|identified|included|flagged|marked)\b[\s\S]{0,48}\b(sentence|claim|passage)/i.test(
      r,
    ) ||
    /\b(sentences?|claims?)[\s\S]{0,40}\b(require|need|needing|requiring|evidence-backed|empirical|citation)/i.test(
      r,
    ) ||
    /\beach requires\b/i.test(r) ||
    /\ball sentences\b/i.test(r)
  )
}

/** Internal failure copy must never be shown as a successful "no citations" result. */
export function isIncompleteAnalysisReasoning(reasoning: string): boolean {
  return /compact retry|incomplete model|couldn't finish analysis|could not finish analysis|failed to (?:parse|read)|did not return/i.test(
    reasoning,
  )
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

/** Humanize pipeline miss reasons for the Citation Feed. */
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
