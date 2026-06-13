import { z } from 'zod'

export const rubricAlignmentSchema = z.object({
  criterion: z.string(),
  addressedBy: z.string(),
  covered: z.boolean(),
})

export const blueprintAnalysisSchema = z.object({
  taskWords: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  boundaries: z.array(z.string()).default([]),
  impliedQuestions: z.array(z.string()).default([]),
  suggestedStructure: z.array(z.string()).default([]),
  formattingRequirements: z.array(z.string()).default([]),
  rubricAlignment: z.array(rubricAlignmentSchema).default([]),
})

export const blueprintAnalyzeResponseSchema = z.object({
  analysis: blueprintAnalysisSchema,
  proposals: z.object({
    title: z.string().optional(),
    thesis: z.string().optional(),
    researchQuestion: z.string().optional(),
    documentType: z.string().optional(),
    wordBudgetSections: z
      .array(z.object({ label: z.string(), targetWords: z.number() }))
      .optional(),
  }),
})

export const outlineNodeSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  type: z.enum(['section', 'point', 'subpoint']),
  title: z.string(),
  sourceRefs: z.array(z.object({ sourceId: z.string(), quote: z.string().optional(), quotes: z.array(z.string()).optional() })).default([]),
  collapsed: z.boolean().default(false),
  order: z.number(),
})

export const outlineGenerateResponseSchema = z.object({
  nodes: z.array(outlineNodeSchema),
})

export const frameworkFieldResponseSchema = z.object({
  value: z.string(),
})

export const draftSuggestionSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  severity: z.enum(['info', 'warning', 'error']).default('info'),
  message: z.string(),
  targetText: z.string().optional(),
  suggestion: z.string().optional(),
  sourceSuggestion: z
    .object({
      title: z.string().optional(),
      url: z.string().optional(),
      authors: z.string().optional(),
      year: z.string().optional(),
      summary: z.string().optional(),
      quote: z.string().optional(),
    })
    .optional(),
  alternatives: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
  targetWritingStyle: z.string().optional(),
})

export const draftToolResponseSchema = z.object({
  suggestions: z.array(draftSuggestionSchema),
})

export const sourceSearchResultSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  authors: z.string().optional(),
  year: z.string().optional(),
  summary: z.string().optional(),
  quotes: z.array(z.string()).default([]),
  type: z.enum(['primary', 'secondary']).default('secondary'),
  provenance: z.enum(['exa', 'openalex', 'merged']).optional(),
})

export const sourceSearchResponseSchema = z.object({
  results: z.array(sourceSearchResultSchema),
})

export const sourceSearchQueryExpansionSchema = z.object({
  webQuery: z.string(),
  academicQuery: z.string(),
  intent: z.enum(['general', 'academic', 'news']).default('general'),
})

export const objectivityScoreSchema = z.object({
  score: z.number().min(0).max(100),
  rationale: z.string(),
})

export const sourceTriageSchema = z.object({
  rankedIndices: z.array(z.number()),
})
