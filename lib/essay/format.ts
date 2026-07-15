/**
 * Display-only formatting for essays.
 * Preserves wording while normalizing spaces and splitting very long paragraphs.
 */
export function formatEssayForDisplay(raw: string): string {
  const normalized = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) return ''

  return normalized
    .split(/\n\s*\n/)
    .map((paragraph) => splitLongParagraph(paragraph.replace(/\n+/g, ' ').trim()))
    .filter(Boolean)
    .join('\n\n')
}

function splitLongParagraph(paragraph: string): string {
  const maxLength = 850
  if (paragraph.length <= maxLength) return paragraph

  const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)
  if (!sentences || sentences.length < 3) return paragraph

  const chunks: string[] = []
  let chunk = ''
  for (const sentence of sentences) {
    const next = `${chunk}${chunk ? ' ' : ''}${sentence.trim()}`
    if (chunk && next.length > maxLength) {
      chunks.push(chunk)
      chunk = sentence.trim()
    } else {
      chunk = next
    }
  }
  if (chunk) chunks.push(chunk)
  return chunks.join('\n\n')
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
