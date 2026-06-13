import {
  PLAN_WORD_LIMITS,
  READING_LEVELS,
  type ReadingLevelOption,
  type WritingStyleOption,
} from '../../constants/blueprintSettings'
import type {
  EssayBlueprint,
  QuickSettings,
  ReferencingStyleId,
  SubscriptionTier,
  WordLimitSettings,
} from '../../types'

const STYLE_PATTERNS: { style: WritingStyleOption; re: RegExp }[] = [
  { style: 'Technical', re: /\b(technical|manual|procedure)\b/i },
  { style: 'Narrative', re: /\b(narrative|story|chronolog)\b/i },
  { style: 'Descriptive', re: /\b(descriptive|vivid|imagery)\b/i },
  { style: 'Persuasive', re: /\b(persuasive|convince|argue for)\b/i },
  { style: 'Analytical', re: /\b(analy[sz]e|analysis|critical)\b/i },
  { style: 'Reflective', re: /\b(reflective|reflection|personal)\b/i },
  { style: 'Analytical', re: /\b(expository|academic|essay|thesis|research)\b/i },
]

const READING_PATTERNS: { level: ReadingLevelOption; re: RegExp }[] = [
  { level: 'Middle School', re: /\b(middle school|grades?\s*6|grades?\s*7|grades?\s*8)\b/i },
  { level: 'High School', re: /\b(high school|secondary|grades?\s*9|gcse|a-?level)\b/i },
  { level: 'Undergraduate', re: /\b(undergraduate|bachelor|university|college)\b/i },
  { level: 'Postgraduate', re: /\b(postgraduate|graduate|master|phd|doctoral)\b/i },
  { level: 'Expert', re: /\b(expert|specialist|professional audience)\b/i },
  { level: 'General Public', re: /\b(general public|lay audience|popular)\b/i },
]

const CITATION_PATTERNS: { id: ReferencingStyleId; re: RegExp }[] = [
  { id: 'apa', re: /\bapa(\s*7)?\b/i },
  { id: 'mla', re: /\bmla(\s*9)?\b/i },
  { id: 'harvard', re: /\bharvard\b/i },
  { id: 'chicago-author-date', re: /\bchicago\s*author[- ]?date\b/i },
  { id: 'chicago-notes', re: /\bchicago\s*(notes|nb)\b/i },
  { id: 'vancouver', re: /\bvancouver\b/i },
  { id: 'ieee', re: /\bieee\b/i },
  { id: 'bluebook', re: /\bbluebook\b/i },
]

function parseWordCounts(text: string, planMax: number): Partial<WordLimitSettings> | null {
  const rangeMatch = text.match(
    /(\d{3,5})\s*[-–—to]+\s*(\d{3,5})\s*words?/i,
  )
  if (rangeMatch) {
    const min = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]))
    const max = Math.min(Math.max(Number(rangeMatch[1]), Number(rangeMatch[2])), planMax)
    return { min, max, minAuto: false, maxAuto: false }
  }

  const maxOnly = text.match(/(?:maximum|max|up to|no more than|at most)\s*(\d{3,5})\s*words?/i)
  if (maxOnly) {
    const max = Math.min(Number(maxOnly[1]), planMax)
    const min = Math.round(max * 0.95)
    return { min, max, minAuto: false, maxAuto: false }
  }

  const minOnly = text.match(/(?:minimum|min|at least)\s*(\d{3,5})\s*words?/i)
  if (minOnly) {
    const min = Number(minOnly[1])
    return { min, max: planMax, minAuto: false, maxAuto: true }
  }

  const simple = text.match(/(\d{3,5})\s*words?/i)
  if (simple) {
    const max = Math.min(Number(simple[1]), planMax)
    const min = Math.round(max * 0.95)
    return { min, max, minAuto: false, maxAuto: false }
  }

  return null
}

export function parseInstructionsFromText(
  text: string,
  plan: SubscriptionTier,
): {
  quickSettings: Partial<QuickSettings>
  wordLimit: Partial<WordLimitSettings> | null
} {
  const quickSettings: Partial<QuickSettings> = {}
  const planMax = PLAN_WORD_LIMITS[plan]

  for (const { style, re } of STYLE_PATTERNS) {
    if (re.test(text)) {
      quickSettings.writingStyle = style
      quickSettings.writingStyleIsAuto = false
      break
    }
  }

  for (const { level, re } of READING_PATTERNS) {
    if (re.test(text)) {
      if (READING_LEVELS.includes(level)) {
        quickSettings.readingLevel = level
        quickSettings.readingLevelIsAuto = false
      }
      break
    }
  }

  for (const { id, re } of CITATION_PATTERNS) {
    if (re.test(text)) {
      quickSettings.referencingStyle = id
      quickSettings.referencingStyleIsAuto = false
      break
    }
  }

  const wordLimit = parseWordCounts(text, planMax)

  return { quickSettings, wordLimit }
}

export function mergeQuickSettingsFromDefaults(
  blueprint: EssayBlueprint,
  usageContext: 'Academic' | 'Business' = 'Academic',
): QuickSettings {
  const qs = { ...blueprint.quickSettings }
  if (qs.writingStyleIsAuto) {
    qs.writingStyle = usageContext === 'Business' ? 'Informative' : 'Analytical'
    qs.writingStyleIsAuto = true
  }
  if (qs.readingLevelIsAuto) {
    qs.readingLevel = 'Auto'
    qs.readingLevelIsAuto = true
  }
  if (qs.referencingStyleIsAuto) {
    qs.referencingStyle = usageContext === 'Business' ? 'harvard' : 'apa'
    qs.referencingStyleIsAuto = true
  }
  return qs
}
