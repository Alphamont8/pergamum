/** Fine-grained pipeline beats for Generation Theater SSE. */
export type CitationPipelineStage =
  | 'claim'
  | 'resolve'
  | 'reuse'
  | 'academic'
  | 'web'
  | 'rank'
  | 'verify'
  | 'found'
  | 'miss'

export type CitationStageReporter = (stage: CitationPipelineStage) => void
