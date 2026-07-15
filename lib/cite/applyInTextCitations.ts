import type { ReferencingStyleId } from '@/types'
import { insertInTextIntoSentence } from '@/lib/cite/insertInTextCitation'

export function applyInTextCitations(
  essay: string,
  citations: Array<{
    sentence: string
    inText?: string
    correction?: string | null
    accepted?: boolean
  }>,
  styleId?: ReferencingStyleId,
): string {
  let output = essay
  const used = new Set<number>()

  for (const c of citations) {
    if (!c.inText) continue
    const base = c.accepted && c.correction ? c.correction : c.sentence
    if (!base) continue

    let from = 0
    let replaced = false
    while (from <= output.length) {
      const start = output.indexOf(base, from)
      if (start === -1) break
      if (!used.has(start)) {
        const before = output.slice(0, start)
        const after = output.slice(start + base.length)
        const cited = insertInTextIntoSentence(base, c.inText, styleId)
        output = before + cited + after
        used.add(start)
        replaced = true
        break
      }
      from = start + 1
    }
    if (!replaced && output.includes(base)) {
      output = output.replace(base, insertInTextIntoSentence(base, c.inText, styleId))
    }
  }
  return output
}
