import type { ReferencingStyleId, SourceRecord } from '@/types'
import { formatInTextCitation } from './service'
import { buildCitationSpanHtml } from './reconcile'

const CITE_TOKEN_RE = /\[cite:([^\]]+)\]/g

export async function convertCitationTokensInHtml(
  html: string,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
): Promise<string> {
  const matches = [...html.matchAll(CITE_TOKEN_RE)]
  if (matches.length === 0) return html

  let result = html
  const prior: string[] = []

  for (const match of matches) {
    const sourceId = match[1].trim()
    const source = sources.find((s) => s.id === sourceId)
    if (!source) continue

    const citationId = `cite-${sourceId}-${Math.random().toString(36).slice(2, 7)}`
    const inText = await formatInTextCitation(source, styleId, sources, {
      priorSourceIds: [...prior],
    })
    prior.push(sourceId)

    const span = buildCitationSpanHtml({
      citationId,
      sourceId: source.id,
      inText,
      sectionId: 'generated',
    })
    result = result.replace(match[0], span)
  }

  return result
}

export async function convertCitationTokensInPlain(
  content: string,
  sources: SourceRecord[],
  styleId: ReferencingStyleId,
): Promise<string> {
  const matches = [...content.matchAll(CITE_TOKEN_RE)]
  if (matches.length === 0) return content

  let result = content
  const prior: string[] = []

  for (const match of matches) {
    const sourceId = match[1].trim()
    const source = sources.find((s) => s.id === sourceId)
    if (!source) continue

    const inText = await formatInTextCitation(source, styleId, sources, {
      priorSourceIds: [...prior],
    })
    prior.push(sourceId)
    result = result.replace(match[0], inText)
  }

  return result
}
