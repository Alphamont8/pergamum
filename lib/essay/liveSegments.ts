export type LiveSentenceStatus = 'pending' | 'active' | 'done' | 'failed'

export interface LiveSentenceState {
  status: LiveSentenceStatus
  inText?: string
  sentence: string
}

export type LiveSegment =
  | { kind: 'plain'; text: string }
  | {
      kind: 'sentence'
      text: string
      sentenceIndex: number
      status: LiveSentenceStatus
      inText?: string
      /** Just-inserted citation for animation keying */
      citeKey?: string
    }

/**
 * Split essay into plain + cite-target segments by locating analyzed sentence substrings.
 * Applies in-text citations the same way as applyInTextCitations (before terminal punctuation).
 */
export function buildLiveEssaySegments(
  essay: string,
  sentences: Array<{ index: number; text: string }>,
  live: Record<number, LiveSentenceState>,
): LiveSegment[] {
  if (!essay) return []

  type Hit = { start: number; end: number; index: number; text: string }
  const hits: Hit[] = []
  const used = new Set<number>()

  for (const s of sentences) {
    const needle = s.text
    if (!needle) continue
    let from = 0
    while (from < essay.length) {
      const start = essay.indexOf(needle, from)
      if (start === -1) break
      const end = start + needle.length
      const overlaps = hits.some((h) => !(end <= h.start || start >= h.end))
      if (!overlaps && !used.has(start)) {
        hits.push({ start, end, index: s.index, text: needle })
        used.add(start)
        break
      }
      from = start + 1
    }
  }

  hits.sort((a, b) => a.start - b.start)

  const segments: LiveSegment[] = []
  let cursor = 0
  for (const hit of hits) {
    if (hit.start > cursor) {
      segments.push({ kind: 'plain', text: essay.slice(cursor, hit.start) })
    }
    const state = live[hit.index]
    const status = state?.status ?? 'pending'
    const inText = state?.inText
    segments.push({
      kind: 'sentence',
      text: hit.text,
      sentenceIndex: hit.index,
      status,
      inText,
      citeKey: inText ? `${hit.index}:${inText}` : undefined,
    })
    cursor = hit.end
  }
  if (cursor < essay.length) {
    segments.push({ kind: 'plain', text: essay.slice(cursor) })
  }
  return segments
}

/** Insert in-text citation before terminal punctuation (mirrors applyInTextCitations). */
export function withInTextCitation(sentence: string, inText: string): { body: string; mark: string; tail: string } {
  // Already cited in the pasted draft — leave the existing mark alone.
  if (/\([A-Z][^)]{0,80}?(?:19|20)\d{2}|\[[0-9]+\]|\(\d+\)/.test(sentence)) {
    return { body: sentence, mark: '', tail: '' }
  }
  const trimmed = sentence.trimEnd()
  if (/[.!?]$/.test(trimmed)) {
    return {
      body: trimmed.slice(0, -1),
      mark: inText,
      tail: trimmed.slice(-1) + sentence.slice(trimmed.length),
    }
  }
  return { body: sentence, mark: inText, tail: '' }
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
}
