import { formatBibliographyBatch, formatInTextCitation } from '@/lib/citations'
import type { GenerationSettings, ReferencingStyleId, SourceRecord } from '@/types'
import type { SentenceCitationResult } from '@/lib/cite/pipeline'

export type CitationJob = {
  sentence: { index: number; text: string }
  result: SentenceCitationResult
}

function sourceIdentityKey(record: SourceRecord): string {
  const doi = record.doi?.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').trim().toLowerCase()
  if (doi) return `doi:${doi}`
  if (record.openAlexId) return `oa:${record.openAlexId}`
  const title = (record.title ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const year = (record.year ?? '').slice(0, 4)
  if (title) return `title:${title}|${year}`
  return `id:${record.id}`
}

/** Format bibliography + in-text strings in sentence order (fixes repeat-source numbering). */
export async function formatCitationJobsInDocumentOrder(
  jobs: CitationJob[],
  styleId: ReferencingStyleId,
  settings: Pick<GenerationSettings, 'inText'>,
): Promise<{
  orderedUniqueIds: string[]
  uniqueSources: SourceRecord[]
  bibliography: string[]
}> {
  const orderedJobs = [...jobs].sort((a, b) => a.sentence.index - b.sentence.index)
  const orderedUniqueIds: string[] = []
  const uniqueSources: SourceRecord[] = []
  const seenIdentity = new Map<string, string>()

  for (const job of orderedJobs) {
    if (job.result.status !== 'done' || !job.result.record) continue
    const record = job.result.record
    const identity = sourceIdentityKey(record)
    const existingId = seenIdentity.get(identity)
    if (existingId) {
      // Point the job at the first canonical record id for consistent numbering.
      job.result.record = {
        ...record,
        id: existingId,
      }
      continue
    }
    seenIdentity.set(identity, record.id)
    orderedUniqueIds.push(record.id)
    uniqueSources.push(record)
  }

  const bibMap = await formatBibliographyBatch(uniqueSources, styleId, orderedUniqueIds)
  const bibliography = orderedUniqueIds
    .map((id) => bibMap.get(id))
    .filter((entry): entry is string => Boolean(entry))

  const priorInDocument: string[] = []
  for (const job of orderedJobs) {
    if (job.result.status !== 'done' || !job.result.record) continue
    const record = job.result.record
    job.result.bibliography = bibMap.get(record.id) ?? job.result.bibliography
    if (settings.inText && !job.result.preserveExistingInText) {
      job.result.inText = await formatInTextCitation(record, styleId, uniqueSources, {
        priorSourceIds: [...priorInDocument],
      })
    } else if (job.result.preserveExistingInText) {
      job.result.inText = undefined
    }
    priorInDocument.push(record.id)
  }

  return { orderedUniqueIds, uniqueSources, bibliography }
}
