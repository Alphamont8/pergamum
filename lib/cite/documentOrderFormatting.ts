import { formatBibliographyBatch, formatInTextCitation } from '@/lib/citations'
import type { GenerationSettings, ReferencingStyleId, SourceRecord } from '@/types'
import type { SentenceCitationResult } from '@/lib/cite/pipeline'

export type CitationJob = {
  sentence: { index: number; text: string }
  result: SentenceCitationResult
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

  for (const job of orderedJobs) {
    if (job.result.status !== 'done' || !job.result.record) continue
    const id = job.result.record.id
    if (!orderedUniqueIds.includes(id)) {
      orderedUniqueIds.push(id)
      uniqueSources.push(job.result.record)
    }
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
