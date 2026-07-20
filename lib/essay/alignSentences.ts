/**
 * Map LLM-extracted claim sentences onto exact spans in the source essay
 * so highlights and cite counts stay in sync.
 */

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ')
}

function tokenize(s: string): string[] {
  return normalizeWs(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

/** Fuzzy locate: best essay window by token Jaccard when exact match fails. */
function fuzzyLocateInEssay(essay: string, needle: string): string | null {
  const needleTokens = tokenize(needle)
  if (needleTokens.length < 4) return null

  const essayNorm = collapseWs(essay)
  const essayTokens = tokenize(essay)
  if (essayTokens.length < needleTokens.length) return null

  const needleSet = new Set(needleTokens)
  const window = Math.min(Math.max(needleTokens.length + 4, needleTokens.length), 48)
  let bestScore = 0
  let bestStart = -1
  let bestEnd = -1

  for (let i = 0; i <= essayTokens.length - Math.min(4, needleTokens.length); i++) {
    const end = Math.min(essayTokens.length, i + window)
    const windowTokens = essayTokens.slice(i, end)
    const windowSet = new Set(windowTokens)
    let inter = 0
    for (const t of needleSet) {
      if (windowSet.has(t)) inter += 1
    }
    const union = needleSet.size + windowSet.size - inter
    const jaccard = union > 0 ? inter / union : 0
    const coverage = inter / needleSet.size
    const score = jaccard * 0.45 + coverage * 0.55
    if (score > bestScore) {
      bestScore = score
      bestStart = i
      bestEnd = end
    }
  }

  // Require strong overlap so we don't invent spans.
  if (bestScore < 0.55 || bestStart < 0) return null

  const startToken = essayTokens[bestStart]
  const endToken = essayTokens[bestEnd - 1]
  if (!startToken || !endToken) return null

  const startIdx = essayNorm.toLowerCase().indexOf(startToken)
  if (startIdx === -1) return null
  const endSearchFrom = startIdx
  const endIdx = essayNorm.toLowerCase().lastIndexOf(endToken)
  if (endIdx < endSearchFrom) return null

  // Map collapsed indices back approximately via original essay whitespace flex.
  const locatedCollapsed = essayNorm.slice(startIdx, endIdx + endToken.length)
  const exact = locateByCollapsed(essay, locatedCollapsed)
  return exact || locatedCollapsed.trim() || null
}

function locateByCollapsed(essay: string, collapsedNeedle: string): string | null {
  const needle = collapseWs(collapsedNeedle)
  if (!needle) return null

  const map: number[] = []
  let collapsed = ''
  let prevSpace = false
  for (let i = 0; i < essay.length; i++) {
    const ch = essay[i]
    if (/\s/.test(ch)) {
      if (!prevSpace && collapsed.length > 0) {
        collapsed += ' '
        map.push(i)
        prevSpace = true
      }
    } else {
      collapsed += ch
      map.push(i)
      prevSpace = false
    }
  }

  const idx = collapsed.indexOf(needle)
  if (idx === -1) return null
  const start = map[idx]
  const endIdx = map[idx + needle.length - 1]
  if (start == null || endIdx == null) return null
  return essay.slice(start, endIdx + 1)
}

/** Find the best contiguous essay span that matches `needle` (exact, whitespace-flex, then fuzzy). */
export function locateSentenceInEssay(essay: string, needle: string): string | null {
  const raw = needle.trim()
  if (!raw || !essay) return null

  if (essay.includes(raw)) return raw

  const collapsedNeedle = collapseWs(raw)
  if (!collapsedNeedle) return null

  const map: number[] = []
  let collapsed = ''
  let prevSpace = false
  for (let i = 0; i < essay.length; i++) {
    const ch = essay[i]
    if (/\s/.test(ch)) {
      if (!prevSpace && collapsed.length > 0) {
        collapsed += ' '
        map.push(i)
        prevSpace = true
      }
    } else {
      collapsed += ch
      map.push(i)
      prevSpace = false
    }
  }

  const idx = collapsed.indexOf(collapsedNeedle)
  if (idx === -1) {
    const softNeedle = collapsedNeedle.replace(/[.?!…]+$/u, '').trim()
    if (softNeedle.length >= 12) {
      const softIdx = collapsed.indexOf(softNeedle)
      if (softIdx !== -1) {
        const start = map[softIdx]
        const endMap = map[softIdx + softNeedle.length - 1]
        if (start == null || endMap == null) return null
        let end = endMap + 1
        while (end < essay.length && /[.?!…'"”’)\]\s]/u.test(essay[end])) end++
        return essay.slice(start, end).trim() || null
      }
    }
    return fuzzyLocateInEssay(essay, raw)
  }

  const start = map[idx]
  const endIdx = map[idx + collapsedNeedle.length - 1]
  if (start == null || endIdx == null) return null
  return essay.slice(start, endIdx + 1)
}

export function alignSentencesToEssay<T extends { index: number; text: string }>(
  essay: string,
  sentences: T[],
): T[] {
  const used = new Set<string>()
  const out: T[] = []

  for (const s of sentences) {
    const located = locateSentenceInEssay(essay, s.text)
    if (!located) continue
    const key = `${located}`
    if (used.has(key)) continue
    used.add(key)
    out.push({ ...s, text: located })
  }

  if (out.length === 0 && sentences.length > 0) {
    return sentences.map((s, i) => ({ ...s, index: i }))
  }

  return out
    .sort((a, b) => essay.indexOf(a.text) - essay.indexOf(b.text))
    .map((s, i) => ({ ...s, index: i }))
}

export function countWords(text: string): number {
  return normalizeWs(text).split(/\s+/).filter(Boolean).length
}
