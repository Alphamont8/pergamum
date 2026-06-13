import type { SubscriptionTier, WordBudget, WordBudgetSection, WordLimitSettings } from '../types'

export const INSTRUCTIONS_CHAR_LIMIT = 4000

export const PLAN_WORD_LIMITS: Record<SubscriptionTier, number> = {
  Basic: 800,
  Plus: 2000,
  Pro: 10000,
  Max: 20000,
}

export {
  WRITING_STYLE_OPTIONS,
  READING_LEVEL_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  REFERENCING_STYLE_OPTIONS,
  planIncludesOption,
  buildWritingStyleOptions,
  buildReadingLevelOptions,
  buildDocumentTypeOptions,
  buildReferencingStyleOptions,
  getOptionDescription,
  clampQuickSettingsToPlan,
  SELECTABLE_PLANS,
} from './preferenceOptions'

export const WRITING_STYLES = [
  'Analytical',
  'Persuasive',
  'Reflective',
  'Informative',
  'Descriptive',
  'Narrative',
  'Evaluative',
  'Technical',
] as const

export type WritingStyleOption = (typeof WRITING_STYLES)[number]

export const READING_LEVELS = [
  'General Public',
  'Middle School',
  'High School',
  'Undergraduate',
  'Postgraduate',
  'Expert',
] as const

export type ReadingLevelOption = (typeof READING_LEVELS)[number]

export type ReferencingStyleId = string

export interface ReferencingStyleDef {
  id: ReferencingStyleId
  label: string
  disciplines: string[]
  minPlan: SubscriptionTier
}

const PLAN_RANK: Record<SubscriptionTier, number> = {
  Basic: 0,
  Plus: 1,
  Pro: 2,
  Max: 3,
}

/** @deprecated Use planIncludesOption from preferenceOptions */
export function planIncludesStyle(
  userPlan: SubscriptionTier,
  minPlan: SubscriptionTier,
): boolean {
  const required = minPlan === 'Max' ? PLAN_RANK.Pro : PLAN_RANK[minPlan]
  return PLAN_RANK[userPlan] >= required
}

export const REFERENCING_STYLES: ReferencingStyleDef[] = [
  { id: 'apa', label: 'APA', disciplines: ['Social sciences', 'Psychology'], minPlan: 'Plus' },
  { id: 'mla', label: 'MLA', disciplines: ['Humanities', 'Literature'], minPlan: 'Plus' },
  { id: 'harvard', label: 'Harvard', disciplines: ['International academia'], minPlan: 'Plus' },
  {
    id: 'chicago-notes',
    label: 'Chicago Notes',
    disciplines: ['History', 'Fine arts'],
    minPlan: 'Pro',
  },
  {
    id: 'chicago-author-date',
    label: 'Chicago Author-Date',
    disciplines: ['Sciences'],
    minPlan: 'Pro',
  },
  { id: 'ieee', label: 'IEEE', disciplines: ['Engineering', 'Computer science'], minPlan: 'Pro' },
  { id: 'vancouver', label: 'Vancouver', disciplines: ['Medicine', 'Biomedical'], minPlan: 'Pro' },
  { id: 'bluebook', label: 'Bluebook', disciplines: ['Legal studies'], minPlan: 'Pro' },
]

export const QUICK_SETTING_TOOLTIPS = {
  documentType:
    'The kind of document you are writing. Auto lets the AI infer from your instructions.',
  writingStyle:
    'Overall approach to the essay. Academic is default for academic contexts; Business for professional reports.',
  readingLevel:
    'Target reading difficulty. Hover the info icon on Reading Level for grade bands and Flesch-Kincaid targets.',
  referencingStyle:
    'Citation format for in-text references and bibliography. Availability depends on your subscription plan.',
  wordLimit:
    'Lower and upper bounds for total essay length. Auto lets the AI decide the word count when generated, as long as it stays within your plan cap.',
} as const

export const DOCUMENT_TYPES = [
  'Expository Essay',
  'Argumentative/Persuasive Essay',
  'Analytical Essay',
  'Literature Review',
  'Research Paper',
  'Case Study',
  'Lab Report',
  'Dissertation/Thesis',
  'Annotated Bibliography',
  'Feature Article',
  'Investigative Reports',
  'Op-Ed',
  'Blog Post',
  'Ad Copy',
  'Executive Summary',
  'Business Proposal',
  'White Paper',
  'Internal Memo',
  'Business Report',
  'Press Release',
  'Personal Statement',
  'Cover Letter',
  'Other',
] as const

export type DocumentTypeOption = (typeof DOCUMENT_TYPES)[number]

const GENERIC_DEFAULT_WORDS = 1500

export const DOC_TYPE_DEFAULT_WORDS: Record<string, number> = {
  'Expository Essay': 1500,
  'Argumentative/Persuasive Essay': 1500,
  'Analytical Essay': 1500,
  'Literature Review': 3000,
  'Research Paper': 2500,
  'Case Study': 2200,
  'Lab Report': 2000,
  'Dissertation/Thesis': 8000,
  'Annotated Bibliography': 2000,
  'Feature Article': 1800,
  'Investigative Reports': 3000,
  'Op-Ed': 800,
  'Blog Post': 1200,
  'Ad Copy': 400,
  'Executive Summary': 800,
  'Business Proposal': 2500,
  'White Paper': 3500,
  'Internal Memo': 600,
  'Business Report': 2500,
  'Press Release': 500,
  'Personal Statement': 1000,
  'Cover Letter': 500,
  Other: 1500,
}

export interface WordBudgetTemplateSection {
  label: string
  percent: number
}

const DEFAULT_TEMPLATE: WordBudgetTemplateSection[] = [
  { label: 'Introduction', percent: 15 },
  { label: 'Supporting Argument I', percent: 20 },
  { label: 'Supporting Argument II', percent: 20 },
  { label: 'Supporting Argument III', percent: 15 },
  { label: 'Counterargument & Rebuttal', percent: 15 },
  { label: 'Conclusion', percent: 15 },
]

export const WORD_BUDGET_TEMPLATES: Record<string, WordBudgetTemplateSection[]> = {
  'Expository Essay': [
    { label: 'Introduction', percent: 15 },
    { label: 'Body Paragraph I', percent: 25 },
    { label: 'Body Paragraph II', percent: 25 },
    { label: 'Body Paragraph III', percent: 20 },
    { label: 'Conclusion', percent: 15 },
  ],
  'Argumentative/Persuasive Essay': DEFAULT_TEMPLATE,
  'Analytical Essay': [
    { label: 'Introduction', percent: 15 },
    { label: 'Analysis Phase I', percent: 25 },
    { label: 'Analysis Phase II', percent: 25 },
    { label: 'Analysis Phase III', percent: 20 },
    { label: 'Conclusion', percent: 15 },
  ],
  'Literature Review': [
    { label: 'Introduction', percent: 15 },
    { label: 'Thematic Synthesis I', percent: 25 },
    { label: 'Thematic Synthesis II', percent: 25 },
    { label: 'Thematic Synthesis III', percent: 20 },
    { label: 'Conclusion', percent: 15 },
  ],
  'Research Paper': [
    { label: 'Introduction & Literature Review', percent: 20 },
    { label: 'Methodology', percent: 15 },
    { label: 'Results / Findings', percent: 20 },
    { label: 'Discussion Part I', percent: 20 },
    { label: 'Discussion Part II', percent: 15 },
    { label: 'Conclusion', percent: 10 },
  ],
  'Case Study': [
    { label: 'Executive Summary / Overview', percent: 10 },
    { label: 'Context & Background', percent: 15 },
    { label: 'The Dilemma / Challenge', percent: 25 },
    { label: 'Solution Phase I', percent: 20 },
    { label: 'Solution Phase II', percent: 15 },
    { label: 'Results & Strategic Takeaways', percent: 15 },
  ],
  'Lab Report': [
    { label: 'Introduction & Hypothesis', percent: 15 },
    { label: 'Materials & Methods', percent: 20 },
    { label: 'Results / Data Collected', percent: 25 },
    { label: 'Discussion Part I', percent: 15 },
    { label: 'Discussion Part II', percent: 15 },
    { label: 'Conclusion', percent: 10 },
  ],
  'Dissertation/Thesis': [
    { label: 'Introduction & Research Context', percent: 10 },
    { label: 'Literature Review Part I', percent: 15 },
    { label: 'Literature Review Part II', percent: 10 },
    { label: 'Methodology', percent: 15 },
    { label: 'Results & Data Analysis', percent: 25 },
    { label: 'Discussion & Critical Interpretations', percent: 15 },
    { label: 'Conclusion & Systemic Recommendations', percent: 10 },
  ],
  'Annotated Bibliography': [
    { label: 'Source Citation', percent: 0 },
    { label: 'Descriptive Summary Part I', percent: 25 },
    { label: 'Descriptive Summary Part II', percent: 25 },
    { label: 'Critical Evaluation', percent: 30 },
    { label: 'Application / Reflection', percent: 20 },
  ],
  'Feature Article': [
    { label: 'The Narrative Lead', percent: 15 },
    { label: 'The Nut Graph', percent: 15 },
    { label: 'Exposition Part I', percent: 20 },
    { label: 'Exposition Part II', percent: 20 },
    { label: 'Exposition Part III', percent: 15 },
    { label: 'The Kicker', percent: 15 },
  ],
  'Investigative Reports': [
    { label: 'The Executive Disclosure', percent: 15 },
    { label: 'Contextual Timeline & Background', percent: 20 },
    { label: 'Evidence Block I', percent: 25 },
    { label: 'Evidence Block II', percent: 20 },
    { label: 'Accountability & Systemic Consequences', percent: 15 },
    { label: 'Conclusion / Call for Reform', percent: 5 },
  ],
  'Op-Ed': [
    { label: 'The News Hook / Lede', percent: 15 },
    { label: 'The Thesis Argument', percent: 10 },
    { label: 'Supporting Point I', percent: 25 },
    { label: 'Supporting Point II', percent: 20 },
    { label: 'The Caveat / Concession', percent: 15 },
    { label: 'The Call to Action / Climax', percent: 15 },
  ],
  'Blog Post': [
    { label: 'The Pain-Point Introduction', percent: 15 },
    { label: 'Solution Section I', percent: 25 },
    { label: 'Solution Section II', percent: 25 },
    { label: 'Solution Section III', percent: 20 },
    { label: 'Conclusion & Call to Action', percent: 15 },
  ],
  'Ad Copy': [
    { label: 'The Headline Hook', percent: 20 },
    { label: 'Core Value Benefit', percent: 25 },
    { label: 'Secondary Interest Driver', percent: 25 },
    { label: 'Call to Action', percent: 30 },
  ],
  'Executive Summary': [
    { label: 'Business Opportunity / Core Problem', percent: 20 },
    { label: 'Proposed Solution Part I', percent: 20 },
    { label: 'Proposed Solution Part II', percent: 20 },
    { label: 'Financial Impact & Projected ROI', percent: 20 },
    { label: 'Strategic Next Steps', percent: 20 },
  ],
  'Business Proposal': [
    { label: 'Executive Summary / Problem Statement', percent: 15 },
    { label: 'Scope & Methodology Part I', percent: 20 },
    { label: 'Scope & Methodology Part II', percent: 20 },
    { label: 'Timeline & Milestone Deliverables', percent: 20 },
    { label: 'Pricing Structure & Terms', percent: 15 },
    { label: 'Company Profile & Proof of Capability', percent: 10 },
  ],
  'White Paper': [
    { label: 'Executive Abstract', percent: 10 },
    { label: 'Problem Statement & Market Friction', percent: 20 },
    { label: 'Current Inadequate Solutions', percent: 15 },
    { label: 'Technical Architecture', percent: 20 },
    { label: 'Implementation Blueprint', percent: 20 },
    { label: 'Business Efficiencies & Conclusion', percent: 15 },
  ],
  'Internal Memo': [
    { label: 'Header Block', percent: 5 },
    { label: 'Statement of Purpose / BLUF', percent: 20 },
    { label: 'Context & Operational Background', percent: 35 },
    { label: 'Actionable Directive I', percent: 20 },
    { label: 'Actionable Directive II', percent: 15 },
    { label: 'Points of Contact / Closing', percent: 5 },
  ],
  'Business Report': [
    { label: 'Executive Summary', percent: 10 },
    { label: 'Introduction & Scope', percent: 10 },
    { label: 'Operational Metrics Analysis', percent: 25 },
    { label: 'Financial Metrics Analysis', percent: 20 },
    { label: 'Strategic Recommendations', percent: 25 },
    { label: 'Conclusion', percent: 10 },
  ],
  'Press Release': [
    { label: 'The Lead Paragraph & Dateline', percent: 25 },
    { label: 'Announcement Core Details', percent: 20 },
    { label: 'Supporting Background Context', percent: 20 },
    { label: 'Executive/Stakeholder Quotes', percent: 20 },
    { label: 'Media Boilerplate & Contact Details', percent: 15 },
  ],
  'Personal Statement': [
    { label: 'The Narrative Hook & Catalyst', percent: 20 },
    { label: 'Academic Achievements', percent: 20 },
    { label: 'Professional/Research Experience', percent: 20 },
    { label: 'Institutional Alignment', percent: 25 },
    { label: 'Future Vision & Conclusion', percent: 15 },
  ],
  'Cover Letter': [
    { label: 'Salutation & Direct Opening', percent: 15 },
    { label: 'Career Milestone Core Focus', percent: 20 },
    { label: 'Supporting Career Achievements', percent: 20 },
    { label: 'Secondary Alignment & Culture Fit', percent: 30 },
    { label: 'Professional Closing & Interview Push', percent: 15 },
  ],
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max)
}

function resolveDocumentType(documentType: string): string {
  if (WORD_BUDGET_TEMPLATES[documentType]) return documentType
  if (DOCUMENT_TYPES.includes(documentType as DocumentTypeOption)) return documentType
  return 'Argumentative/Persuasive Essay'
}

function slugifyDocumentType(documentType: string): string {
  return documentType.replace(/\s+/g, '-').toLowerCase()
}

export function applyWeightsToWordTotal(
  sections: WordBudgetSection[],
  targetTotal: number,
): WordBudgetSection[] {
  if (sections.length === 0) return sections
  const result = sections.map((s) => ({
    ...s,
    targetWords: Math.round((targetTotal * s.weightPercent) / 100),
  }))
  const assigned = result.reduce((sum, s) => sum + s.targetWords, 0)
  if (assigned !== targetTotal) {
    const adjustable = [...result]
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.weightPercent > 0)
    const fixIndex = adjustable[adjustable.length - 1]?.index ?? result.length - 1
    result[fixIndex]!.targetWords += targetTotal - assigned
  }
  return result
}

/** Scale section percentages so they sum to 100%. */
export function normalizeSectionWeights(sections: WordBudgetSection[]): WordBudgetSection[] {
  if (sections.length === 0) return sections
  const sum = sections.reduce((total, s) => total + s.weightPercent, 0)
  if (sum <= 0) return sections
  if (sum === 100) return sections

  const scaled = sections.map((s) => ({
    ...s,
    weightPercent: Math.max(0, Math.round((s.weightPercent / sum) * 100)),
  }))
  const scaledSum = scaled.reduce((total, s) => total + s.weightPercent, 0)
  if (scaledSum !== 100) {
    const adjustable = [...scaled]
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => s.weightPercent > 0)
    const fixIndex = adjustable[adjustable.length - 1]?.index ?? scaled.length - 1
    scaled[fixIndex]!.weightPercent += 100 - scaledSum
  }
  return scaled
}

export function applyWordBudgetTemplate(
  documentType: string,
  totalWords: number,
): WordBudget {
  const docType = resolveDocumentType(documentType)
  const template = WORD_BUDGET_TEMPLATES[docType] ?? DEFAULT_TEMPLATE
  const slug = slugifyDocumentType(docType)

  const sections: WordBudgetSection[] = template.map((item, order) => ({
    id: `sec-${slug}-${order}`,
    label: item.label,
    weightPercent: item.percent,
    targetWords: Math.round((totalWords * item.percent) / 100),
  }))

  const withWords = applyWeightsToWordTotal(sections, totalWords)
  return { total: totalWords, sections: withWords }
}

export interface ParsedWordCounts {
  min?: number
  max?: number
  target?: number
}

export function parseWordCountsFromText(text: string, planMax: number): ParsedWordCounts | null {
  const rangeMatch = text.match(/(\d{3,5})\s*[-–—to]+\s*(\d{3,5})\s*words?/i)
  if (rangeMatch) {
    const a = Number(rangeMatch[1])
    const b = Number(rangeMatch[2])
    const min = Math.min(a, b)
    const max = Math.min(Math.max(a, b), planMax)
    return { min, max, target: Math.round((min + max) / 2) }
  }

  const maxOnly = text.match(/(?:maximum|max|up to|no more than|at most)\s*(\d{3,5})\s*words?/i)
  if (maxOnly) {
    const max = Math.min(Number(maxOnly[1]), planMax)
    return { max, target: max }
  }

  const minOnly = text.match(/(?:minimum|min|at least)\s*(\d{3,5})\s*words?/i)
  if (minOnly) {
    const min = Number(minOnly[1])
    return { min, target: Math.round((min + planMax) / 2) }
  }

  const simple = text.match(/(\d{3,5})\s*words?/i)
  if (simple) {
    const target = Math.min(Number(simple[1]), planMax)
    return { target, max: target }
  }

  return null
}

export function computeAutoWordLimit(
  options: {
    instructionsText: string
    documentType: string
    planMax: number
    minAuto: boolean
    maxAuto: boolean
  },
): Pick<WordLimitSettings, 'min' | 'max'> {
  const { instructionsText, documentType, planMax, minAuto, maxAuto } = options
  const parsed = parseWordCountsFromText(instructionsText, planMax)
  const docType = resolveDocumentType(documentType)
  const defaultTarget = DOC_TYPE_DEFAULT_WORDS[docType] ?? GENERIC_DEFAULT_WORDS
  const target = clamp(parsed?.target ?? defaultTarget, 100, planMax)

  let min = parsed?.min ?? Math.round(target * 0.9)
  let max = parsed?.max ?? Math.round(target * 1.1)
  min = clamp(min, 100, planMax)
  max = clamp(max, min, planMax)

  if (!minAuto && !maxAuto) {
    return { min, max }
  }
  if (minAuto && maxAuto) {
    return { min, max }
  }
  if (minAuto) {
    return { min: clamp(Math.round(max * 0.9), 100, max), max }
  }
  return { min, max: clamp(Math.round(min * 1.1), min, planMax) }
}

export function rebalanceWordBudgetSections(
  sections: WordBudgetSection[],
  targetTotal: number,
): WordBudgetSection[] {
  const normalized = normalizeSectionWeights(sections)
  return applyWeightsToWordTotal(normalized, targetTotal)
}
