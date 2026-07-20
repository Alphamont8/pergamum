const SENTENCE_END = /[.!?…]["'”’)\]]*\s*$/

function isListLine(line: string): boolean {
  return /^\s*(?:[-•*]|\d+[.)])\s+/.test(line.trim())
}

/** True when a single newline looks like a soft wrap, not a deliberate break. */
function shouldMergeSplitLines(previous: string, next: string): boolean {
  const prev = previous.trimEnd()
  const nextLine = next.trimStart()
  if (!prev || !nextLine) return false
  if (isListLine(prev) || isListLine(nextLine)) return false

  // Hyphenated word wrap: "inter-\nnational"
  if (/-$/.test(prev)) return true

  // Next line continues mid-sentence.
  if (/^[a-z('"‘“(]/.test(nextLine)) return true

  // Previous line does not end a sentence — likely wrapped.
  if (!SENTENCE_END.test(prev)) return true

  return false
}

function joinSplitLines(previous: string, next: string): string {
  const prev = previous.trimEnd()
  const nextLine = next.trimStart()
  if (/-$/.test(prev)) return prev.slice(0, -1) + nextLine
  return `${prev} ${nextLine}`
}

/** Merge soft single-newline wraps inside one paragraph block. */
export function mergeSoftLineBreaks(block: string): string {
  const lines = block.split('\n')
  if (lines.length <= 1) return block.trim()

  const parts: string[] = []
  let current = lines[0] ?? ''

  for (let i = 1; i < lines.length; i++) {
    const next = lines[i] ?? ''
    if (shouldMergeSplitLines(current, next)) {
      current = joinSplitLines(current, next)
    } else {
      parts.push(current.trimEnd())
      current = next
    }
  }
  parts.push(current.trimEnd())

  return parts
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * Display normalization for essays.
 * Keeps paragraph breaks (`\n\n`) but merges soft single-line wraps so split
 * sentences read as one flowing paragraph.
 */
export function formatEssayForDisplay(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!normalized) return ''

  return normalized
    .split(/\n\s*\n/)
    .map((block) => mergeSoftLineBreaks(block).replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

/** Paragraph blocks for export (same reflow rules as display). */
export function formatEssayParagraphs(raw: string): string[] {
  const formatted = formatEssayForDisplay(raw)
  if (!formatted) return []
  return formatted.split(/\n\s*\n/).filter(Boolean)
}

/** Light whitespace cleanup for newly pasted essays without changing wording. */
export function cleanPastedEssay(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Bibliography entries as paste-friendly plain text (blank line between entries). */
export function formatBibliographyForCopy(entries: string[]): string {
  return entries
    .map((e) => e.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}
