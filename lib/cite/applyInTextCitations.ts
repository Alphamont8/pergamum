import { sentenceHasExistingInTextCitation } from '@/lib/cite/existingCitation'

export function applyInTextCitations(
  essay: string,
  citations: Array<{ sentence: string; inText?: string; correction?: string | null; accepted?: boolean }>,
): string {
  let output = essay
  for (const c of citations) {
    if (!c.inText) continue
    const base = c.accepted && c.correction ? c.correction : c.sentence
    if (!output.includes(base)) continue
    // Draft already cites this claim — don't append a second marker.
    if (sentenceHasExistingInTextCitation(base)) continue
    const withCite = /[.!?]$/.test(base.trim())
      ? `${base.trim().replace(/[.!?]$/, '')} ${c.inText}${base.trim().slice(-1)}`
      : `${base} ${c.inText}`
    output = output.replace(base, withCite)
  }
  return output
}
