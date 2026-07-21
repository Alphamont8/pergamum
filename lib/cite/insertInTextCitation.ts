import type { ReferencingStyleId } from '@/types'
import {
  isScienceParentheticalStyle,
  isSuperscriptReferencingStyle,
} from '@/utils/referencingStyle'
import { sentenceHasExistingInTextCitation } from '@/lib/cite/existingCitation'

function usesTightCitationMark(inText: string, styleId?: ReferencingStyleId): boolean {
  if (styleId && isSuperscriptReferencingStyle(styleId)) return true
  // Science parentheticals keep a normal word space before (n).
  if (styleId && isScienceParentheticalStyle(styleId)) return false
  return /^[\d¹²³⁴⁵⁶⁷⁸⁹⁰]+$/u.test(inText.trim())
}

/** Insert a formatted in-text marker into a sentence (style-aware spacing). */
export function insertInTextIntoSentence(
  sentence: string,
  inText: string,
  styleId?: ReferencingStyleId,
): string {
  if (!inText.trim()) return sentence
  if (sentenceHasExistingInTextCitation(sentence)) return sentence

  const trimmed = sentence.trimEnd()
  const trailingWs = sentence.slice(trimmed.length)
  const tight = usesTightCitationMark(inText, styleId)

  if (/[.!?…]$/.test(trimmed)) {
    const body = trimmed.slice(0, -1).trimEnd()
    const punct = trimmed.slice(-1)
    return tight
      ? `${body}${inText}${punct}${trailingWs}`
      : `${body} ${inText}${punct}${trailingWs}`
  }

  return tight ? `${trimmed}${inText}${trailingWs}` : `${trimmed} ${inText}${trailingWs}`
}

/** Split a sentence for live rendering (body / mark / tail). */
export function splitInTextCitation(
  sentence: string,
  inText: string,
  styleId?: ReferencingStyleId,
): { body: string; mark: string; tail: string } {
  if (!inText.trim() || sentenceHasExistingInTextCitation(sentence)) {
    return { body: sentence, mark: '', tail: '' }
  }

  const trimmed = sentence.trimEnd()
  const trailingWs = sentence.slice(trimmed.length)
  const tight = usesTightCitationMark(inText, styleId)

  if (/[.!?…]$/.test(trimmed)) {
    const body = trimmed.slice(0, -1).trimEnd()
    const punct = trimmed.slice(-1)
    return {
      body,
      mark: tight ? inText : ` ${inText}`,
      tail: `${punct}${trailingWs}`,
    }
  }

  return {
    body: trimmed,
    mark: tight ? inText : ` ${inText}`,
    tail: trailingWs,
  }
}
