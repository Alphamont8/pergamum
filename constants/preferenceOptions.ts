import type { SubscriptionTier } from '../types'

export interface PreferenceSelectOption {
  value: string
  label: string
  disabled?: boolean
  hint?: string
  planTag?: string
  description?: string
}

export const SELECTABLE_PLANS = ['Basic', 'Plus', 'Pro'] as const
export type SelectablePlan = (typeof SELECTABLE_PLANS)[number]

const PLAN_RANK: Record<SubscriptionTier, number> = {
  Basic: 0,
  Plus: 1,
  Pro: 2,
  Max: 3,
}

/** Pro selector unlocks both Pro- and Max-tier preference options. */
export function planIncludesOption(
  userPlan: SubscriptionTier,
  minPlan: SubscriptionTier,
): boolean {
  const userRank = PLAN_RANK[userPlan]
  const requiredRank = minPlan === 'Max' ? PLAN_RANK.Pro : PLAN_RANK[minPlan]
  return userRank >= requiredRank
}

export function planTagLabel(minPlan: SubscriptionTier): string {
  if (minPlan === 'Max') return 'Pro'
  return minPlan
}

export interface PreferenceOptionDef {
  id: string
  label: string
  description: string
  minPlan: SubscriptionTier
}

export const WRITING_STYLE_OPTIONS: PreferenceOptionDef[] = [
  {
    id: 'Analytical',
    label: 'Analytical',
    description:
      'Objective and critical tone, breaks down a complex topic into components to examine how they function and interconnect.',
    minPlan: 'Plus',
  },
  {
    id: 'Persuasive',
    label: 'Persuasive',
    description:
      'Confident and argumentative tone, deploys rhetorical strategies and logical evidence to convince the reader of a specific viewpoint.',
    minPlan: 'Plus',
  },
  {
    id: 'Reflective',
    label: 'Reflective',
    description:
      'Introspective and subjective tone, evaluates personal growth, experiences, and cognitive insights from a first-person perspective.',
    minPlan: 'Plus',
  },
  {
    id: 'Informative',
    label: 'Informative',
    description:
      'Clear and factual tone, presents straightforward information, data, or updates directly to the reader to build baseline knowledge.',
    minPlan: 'Pro',
  },
  {
    id: 'Descriptive',
    label: 'Descriptive',
    description:
      'Detailed and sensory tone, focuses on vivid imagery and deep detail to paint a clear picture of a person, place, or thing.',
    minPlan: 'Pro',
  },
  {
    id: 'Narrative',
    label: 'Narrative',
    description:
      'Story-driven and sequential tone, connects events chronologically to share a cohesive experience or journey.',
    minPlan: 'Pro',
  },
  {
    id: 'Evaluative',
    label: 'Evaluative',
    description:
      'Critical and balanced tone, weighs strengths and weaknesses to judge the overall value, performance, or quality of a subject.',
    minPlan: 'Pro',
  },
  {
    id: 'Technical',
    label: 'Technical',
    description:
      'Direct and instructional tone, uses unambiguous language and precise terminology to explain complex systems, manuals, or procedures.',
    minPlan: 'Pro',
  },
]

export const READING_LEVEL_OPTIONS: PreferenceOptionDef[] = [
  {
    id: 'General Public',
    label: 'General Public',
    description:
      'FRE 60-70, FKGL 8-10. Accessible and engaging text utilizing active verbs and clear analogies while stripping away exclusive jargon.',
    minPlan: 'Plus',
  },
  {
    id: 'Middle School',
    label: 'Middle School',
    description:
      'FRE 70-80, FKGL 6-9. Clear and highly conversational prose utilizing short, uncomplicated sentences and everyday vocabulary.',
    minPlan: 'Plus',
  },
  {
    id: 'High School',
    label: 'High School',
    description:
      'FRE 50-60, FKGL 10-12. Balanced and structured prose using varied sentence lengths, mature vocabulary, and standard analytical arguments.',
    minPlan: 'Plus',
  },
  {
    id: 'Undergraduate',
    label: 'Undergraduate',
    description:
      'FRE 30-50, FKGL 13-16. Disciplined and analytical writing featuring discipline-specific terminology and complex, multi-layered logical frameworks.',
    minPlan: 'Plus',
  },
  {
    id: 'Postgraduate',
    label: 'Postgraduate',
    description:
      'FRE 10-30, FKGL 17-19. Rigorous and dense research text using extensive academic vocabulary, intense abstraction, and long, multi-clause sentences.',
    minPlan: 'Pro',
  },
  {
    id: 'Expert',
    label: 'Expert',
    description:
      'FRE 0-10, FKGL 20+. Highly specialized and uncompromising domain-expert language packed with advanced terminology meant strictly for peer-reviewed standards.',
    minPlan: 'Pro',
  },
]

export const DOCUMENT_TYPE_OPTIONS: PreferenceOptionDef[] = [
  {
    id: 'Argumentative/Persuasive Essay',
    label: 'Argumentative/Persuasive Essay',
    description:
      'Academic contexts. A detailed paper establishing a firm position on a controversial topic supported by external evidence.',
    minPlan: 'Plus',
  },
  {
    id: 'Expository Essay',
    label: 'Expository Essay',
    description:
      'Academic contexts. An objective paper designed to explain, illustrate, or clarify a specific topic using factual evidence.',
    minPlan: 'Plus',
  },
  {
    id: 'Analytical Essay',
    label: 'Analytical Essay',
    description:
      'Academic contexts. A critical paper that breaks down a text, process, or concept into components to evaluate how they function together.',
    minPlan: 'Plus',
  },
  {
    id: 'Internal Memo',
    label: 'Internal Memo',
    description:
      'Corporate contexts. A brief, direct internal communication used to share policy updates, announcements, or directives within an organization.',
    minPlan: 'Plus',
  },
  {
    id: 'Business Report',
    label: 'Business Report',
    description:
      'Corporate contexts. A structured, data-driven document analyzing performance, operational metrics, or strategic outcomes to guide business decisions.',
    minPlan: 'Plus',
  },
  {
    id: 'Op-Ed',
    label: 'Op-Ed',
    description:
      'Journalism contexts. A concise opinion piece written by a contributor or expert to present a sharp, persuasive perspective on current events.',
    minPlan: 'Plus',
  },
  {
    id: 'Blog Post',
    label: 'Blog Post',
    description:
      'Digital media contexts. An informal, engaging, and scannable online article designed to inform, entertain, or drive traffic.',
    minPlan: 'Plus',
  },
  {
    id: 'Feature Article',
    label: 'Feature Article',
    description:
      'Journalism contexts. A creative and deeply reported piece of narrative journalism focusing on a specific person, event, or trend.',
    minPlan: 'Plus',
  },
  {
    id: 'Executive Summary',
    label: 'Executive Summary',
    description:
      'Corporate contexts. A high-level, condensed synthesis of a massive report designed for rapid strategic scanning by busy decision-makers.',
    minPlan: 'Plus',
  },
  {
    id: 'Ad Copy',
    label: 'Ad Copy',
    description:
      'Marketing contexts. Highly persuasive, punchy text engineered to capture attention and drive immediate reader action or conversions.',
    minPlan: 'Pro',
  },
  {
    id: 'Annotated Bibliography',
    label: 'Annotated Bibliography',
    description:
      'Academic contexts. A structured list of citations where each source is followed by a brief evaluative and descriptive paragraph.',
    minPlan: 'Pro',
  },
  {
    id: 'Business Proposal',
    label: 'Business Proposal',
    description:
      'Corporate contexts. A persuasive, outcomes-focused pitch outlining a specific project solution, timeline, and cost structure for a client.',
    minPlan: 'Pro',
  },
  {
    id: 'Case Study',
    label: 'Case Study',
    description:
      'Academic and corporate contexts. An intensive, detailed investigation of a single individual, group, event, or organization to explore underlying principles.',
    minPlan: 'Pro',
  },
  {
    id: 'Cover Letter',
    label: 'Cover Letter',
    description:
      'Professional contexts. A formal, targeted document introducing a job applicant and connecting their specific career achievements directly to the hiring needs of an organization.',
    minPlan: 'Pro',
  },
  {
    id: 'Dissertation/Thesis',
    label: 'Dissertation/Thesis',
    description:
      'Academic contexts. A long-form, deeply independent research document required to fulfill advanced graduate degree requirements.',
    minPlan: 'Pro',
  },
  {
    id: 'Investigative Reports',
    label: 'Investigative Reports',
    description:
      'Journalism contexts. An in-depth, deeply researched exposure of a complex issue, systemic failure, or hidden wrongdoing.',
    minPlan: 'Pro',
  },
  {
    id: 'Lab Report',
    label: 'Lab Report',
    description:
      'Academic and scientific contexts. A structured document detailing the purpose, methods, data results, and conclusions of a controlled experiment.',
    minPlan: 'Pro',
  },
  {
    id: 'Literature Review',
    label: 'Literature Review',
    description:
      'Academic contexts. A comprehensive synthesis that evaluates, groups, and contrasts existing scholarly research around a specific topic.',
    minPlan: 'Pro',
  },
  {
    id: 'Personal Statement',
    label: 'Personal Statement',
    description:
      'Academic contexts. A reflective, narrative-driven essay detailing an applicant\'s personal background, academic motivations, and long-term goals for institutional admission.',
    minPlan: 'Pro',
  },
  {
    id: 'Press Release',
    label: 'Press Release',
    description:
      'Public relations contexts. A formal, concise official statement sent to the media to announce a noteworthy event or launch.',
    minPlan: 'Pro',
  },
  {
    id: 'Research Paper',
    label: 'Research Paper',
    description:
      'Academic contexts. A rigorous study that follows standard formal structures to present original findings, data, or deep analysis.',
    minPlan: 'Pro',
  },
  {
    id: 'White Paper',
    label: 'White Paper',
    description:
      'Corporate and technical contexts. An authoritative, in-depth technical report proposing a specific solution to a widespread industry problem.',
    minPlan: 'Pro',
  },
  {
    id: 'Other',
    label: 'Other',
    description: 'Insert your own Document Type.',
    minPlan: 'Pro',
  },
]

export const REFERENCING_STYLE_OPTIONS: PreferenceOptionDef[] = [
  {
    id: 'apa',
    label: 'APA',
    description:
      'Social sciences and psychology contexts. An author-date parenthetical system that highlights the recency of research using inline citations and a final reference list.',
    minPlan: 'Plus',
  },
  {
    id: 'mla',
    label: 'MLA',
    description:
      'Humanities and literature contexts. An author-page parenthetical system that tracks authorship and exact source locations using inline citations and a works cited page.',
    minPlan: 'Plus',
  },
  {
    id: 'harvard',
    label: 'Harvard',
    description:
      'International academic contexts. A parenthetical author-date style widely adapted across global higher education disciplines to credit sources uniformly.',
    minPlan: 'Plus',
  },
  {
    id: 'chicago-notes',
    label: 'Chicago Notes',
    description:
      'History and fine arts contexts. A traditional note-based system utilizing numerical superscripts that direct readers to detailed page-bottom footnotes and a full bibliography.',
    minPlan: 'Pro',
  },
  {
    id: 'chicago-author-date',
    label: 'Chicago Author-Date',
    description:
      'Physical and natural sciences contexts. A variation of the Chicago system that adapts traditional styling rules into a streamlined parenthetical author-date format.',
    minPlan: 'Pro',
  },
  {
    id: 'ieee',
    label: 'IEEE',
    description:
      'Engineering and computer science contexts. A numbered citation system tracking sources chronologically using bracketed numbers tied to an end-of-text reference list.',
    minPlan: 'Pro',
  },
  {
    id: 'vancouver',
    label: 'Vancouver',
    description:
      'Medical and biological science contexts. A numbered citation style linking inline numerical sequences directly to a reference list ordered strictly by appearance in the text.',
    minPlan: 'Pro',
  },
  {
    id: 'bluebook',
    label: 'Bluebook',
    description:
      'Legal studies and professional contexts. A highly rigid citation framework designed specifically to format court cases, statutes, and legal briefs accurately.',
    minPlan: 'Pro',
  },
]

const AUTO_DESCRIPTIONS = {
  writingStyle: 'Writing Style will be automatically chosen.',
  readingLevel: 'Reading Level will be automatically chosen.',
  documentType: 'Document Type will be automatically chosen.',
  referencingStyle: 'Referencing Style will be automatically chosen.',
  referencingNone:
    'No references will be generated. References are not available for the Basic plan.',
} as const

function tierGroupRank(minPlan: SubscriptionTier): number {
  if (minPlan === 'Basic') return 0
  if (minPlan === 'Plus') return 1
  return 2
}

function sortByPlanThenLabel(a: PreferenceOptionDef, b: PreferenceOptionDef): number {
  const tierDiff = tierGroupRank(a.minPlan) - tierGroupRank(b.minPlan)
  if (tierDiff !== 0) return tierDiff
  return a.label.localeCompare(b.label)
}

/** MLA before Harvard within the Plus referencing group. */
function sortReferencingOptions(a: PreferenceOptionDef, b: PreferenceOptionDef): number {
  const tierDiff = tierGroupRank(a.minPlan) - tierGroupRank(b.minPlan)
  if (tierDiff !== 0) return tierDiff
  if (a.id === 'mla') return -1
  if (b.id === 'mla') return 1
  if (a.id === 'harvard' && b.id !== 'mla') return 1
  if (b.id === 'harvard' && a.id !== 'mla') return -1
  return a.label.localeCompare(b.label)
}

export function buildGroupedPreferenceOptions(
  defs: PreferenceOptionDef[],
  userPlan: SubscriptionTier,
  auto?: { value: string; label: string; description: string },
  sortFn: (a: PreferenceOptionDef, b: PreferenceOptionDef) => number = sortByPlanThenLabel,
): PreferenceSelectOption[] {
  const sorted = [...defs].sort(sortFn)
  const options: PreferenceSelectOption[] = []

  if (auto) {
    options.push({
      value: auto.value,
      label: auto.label,
      description: auto.description,
    })
  }

  for (const def of sorted) {
    const included = planIncludesOption(userPlan, def.minPlan)
    options.push({
      value: def.id,
      label: def.label,
      description: def.description,
      disabled: !included,
      planTag: included ? undefined : planTagLabel(def.minPlan),
    })
  }

  return options
}

export function buildWritingStyleOptions(userPlan: SubscriptionTier): PreferenceSelectOption[] {
  return buildGroupedPreferenceOptions(WRITING_STYLE_OPTIONS, userPlan, {
    value: 'Auto',
    label: 'Auto',
    description: AUTO_DESCRIPTIONS.writingStyle,
  })
}

export function buildReadingLevelOptions(userPlan: SubscriptionTier): PreferenceSelectOption[] {
  return buildGroupedPreferenceOptions(READING_LEVEL_OPTIONS, userPlan, {
    value: 'Auto',
    label: 'Auto',
    description: AUTO_DESCRIPTIONS.readingLevel,
  })
}

function sortDocumentTypeOptions(a: PreferenceOptionDef, b: PreferenceOptionDef): number {
  if (a.id === 'Other') return 1
  if (b.id === 'Other') return -1
  return sortByPlanThenLabel(a, b)
}

export function buildDocumentTypeOptions(userPlan: SubscriptionTier): PreferenceSelectOption[] {
  return buildGroupedPreferenceOptions(
    DOCUMENT_TYPE_OPTIONS,
    userPlan,
    {
      value: 'Auto',
      label: 'Auto',
      description: AUTO_DESCRIPTIONS.documentType,
    },
    sortDocumentTypeOptions,
  )
}

export function buildReferencingStyleOptions(userPlan: SubscriptionTier): PreferenceSelectOption[] {
  const noneDescription =
    userPlan === 'Basic'
      ? AUTO_DESCRIPTIONS.referencingNone
      : 'No references will be generated.'

  const options: PreferenceSelectOption[] = [
    {
      value: 'none',
      label: 'None',
      description: noneDescription,
    },
  ]

  const sorted = [...REFERENCING_STYLE_OPTIONS].sort(sortReferencingOptions)
  for (const def of sorted) {
    const included = planIncludesOption(userPlan, def.minPlan)
    options.push({
      value: def.id,
      label: def.label,
      description: def.description,
      disabled: !included,
      planTag: included ? undefined : planTagLabel(def.minPlan),
    })
  }

  return options
}

export function getOptionDescription(
  options: PreferenceSelectOption[],
  value: string,
): string | undefined {
  return options.find((o) => o.value === value)?.description
}

export function isWritingStyleAllowed(value: string, plan: SubscriptionTier): boolean {
  if (value === 'Auto') return true
  const def = WRITING_STYLE_OPTIONS.find((o) => o.id === value)
  return def ? planIncludesOption(plan, def.minPlan) : false
}

export function isReadingLevelAllowed(value: string, plan: SubscriptionTier): boolean {
  if (value === 'Auto') return true
  const def = READING_LEVEL_OPTIONS.find((o) => o.id === value)
  return def ? planIncludesOption(plan, def.minPlan) : false
}

export function isDocumentTypeAllowed(value: string, plan: SubscriptionTier): boolean {
  if (value === 'Auto') return true
  if (value === 'Other') return planIncludesOption(plan, 'Pro')
  const def = DOCUMENT_TYPE_OPTIONS.find((o) => o.id === value)
  return def ? planIncludesOption(plan, def.minPlan) : false
}

export function isReferencingStyleAllowed(value: string, plan: SubscriptionTier): boolean {
  if (value === 'none') return true
  const def = REFERENCING_STYLE_OPTIONS.find((o) => o.id === value)
  return def ? planIncludesOption(plan, def.minPlan) : false
}

export function clampQuickSettingsToPlan(
  quickSettings: import('../types').QuickSettings,
  plan: SubscriptionTier,
): import('../types').QuickSettings {
  const next = { ...quickSettings }

  if (!next.writingStyleIsAuto && !isWritingStyleAllowed(next.writingStyle, plan)) {
    next.writingStyle = 'Auto'
    next.writingStyleIsAuto = true
  }

  if (!next.readingLevelIsAuto && !isReadingLevelAllowed(next.readingLevel, plan)) {
    next.readingLevel = 'Auto'
    next.readingLevelIsAuto = true
  }

  if (!next.documentTypeIsAuto) {
    if (next.documentType === 'Other' && !planIncludesOption(plan, 'Pro')) {
      next.documentType = 'Auto'
      next.documentTypeIsAuto = true
    } else if (
      next.documentType !== 'Other' &&
      !isDocumentTypeAllowed(next.documentType, plan)
    ) {
      next.documentType = 'Auto'
      next.documentTypeIsAuto = true
    }
  }

  if (next.referencingStyleIsAuto || next.referencingStyle === 'Auto') {
    next.referencingStyle = 'none'
    next.referencingStyleIsAuto = false
  }

  if (!isReferencingStyleAllowed(next.referencingStyle, plan)) {
    next.referencingStyle = 'none'
    next.referencingStyleIsAuto = false
  }

  return next
}
