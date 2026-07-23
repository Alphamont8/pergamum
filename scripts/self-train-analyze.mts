/**
 * Analyze-only self-training harness (no Generate / cite).
 *
 * Usage: npx tsx --env-file=.env.local scripts/self-train-analyze.mts
 * Optional: SELF_TRAIN_ONLY=1,3,11
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  analyzeEssayForCitations,
  claimQueryFromAnalyzed,
  type AnalyzedSentence,
} from '../lib/cite/analyze'
import { alignSentencesToEssay } from '../lib/essay/alignSentences'
import { countWords } from '../lib/billing/entitlements'
import { isLlmConfigured } from '../lib/ai/provider'
import type { GenerationSettings } from '../types'

type Persona =
  | 'undergrad-psych'
  | 'business-brand'
  | 'current-news'
  | 'opinion-only'
  | 'medical'
  | 'legal'
  | 'pre-cited'
  | 'messy-paste'
  | 'history'
  | 'mixed-claims'
  | 'dense-stats'

interface Scenario {
  id: number
  persona: Persona
  label: string
  why: string
  settings: GenerationSettings
  allowChunked: boolean
  expect: {
    medical?: boolean
    legal?: boolean
    minClaims?: number
    maxClaims?: number
    mustSkip?: string[]
    brandBan?: string[]
    preferNews?: boolean
    /** Require Phase B claim-query fields on ≥ this fraction of sentences. */
    minEnrichmentRate?: number
    /** Soft latency target (ms); overage is a note, not always a hard fail. */
    latencyTargetMs?: number
    /** Hard fail if over this (ms). */
    latencyHardMs?: number
  }
  essay: string
}

function denseStatsEssay(): string {
  const paras = [
    `Global smartphone shipments reached 1.24 billion units in 2024 according to industry trackers, recovering from three consecutive years of contraction. Statista reports that Apple held roughly 18% of worldwide unit share in Q4 2024 while Samsung remained near 19%. Average selling prices rose to about $410 per device in premium segments, even as entry-level Android ASPs stayed below $180 in emerging markets.`,
    `In the United States, Pew Research Center surveys from 2023 found that 97% of adults under 30 own a smartphone, compared with 76% of adults aged 65 and older. Mobile advertising spend crossed $180 billion globally in 2024, with retail and consumer electronics accounting for nearly one-third of that total. App Annie (data.ai) estimated that consumers spent $171 billion in app stores during 2023, up 3% year over year.`,
    `E-commerce penetration continued to climb: UNCTAD estimated that business-to-consumer online sales represented 19% of total retail trade in developed economies in 2022. In Southeast Asia, Google–Temasek–Bain e-Conomy reports put the digital economy at $263 billion in GMV for 2024, with e-commerce contributing more than half. Indonesia alone accounted for roughly $82 billion of that GMV.`,
    `Logistics and last-mile delivery remain capacity constraints. McKinsey analysis has suggested that parcel volumes in major cities may grow 8–10% annually through 2030 if omnichannel retail continues on its current path. Same-day delivery share reached 12% of online orders in top-tier US metros in 2024 according to industry consultancies, versus under 4% in mid-sized markets.`,
    `Climate disclosure is reshaping procurement. CDP reported that over 23,000 companies disclosed environmental data through its platform in 2023. Science Based Targets initiative (SBTi) counted more than 4,000 companies with validated near-term targets by mid-2024. Scope 3 emissions often represent 70–90% of a consumer brand's footprint, which pushes suppliers toward renewable electricity purchasing.`,
    `Energy markets responded unevenly. IEA data showed global renewable electricity generation capacity additions of about 510 GW in 2023, the highest annual figure on record. Solar photovoltaic alone contributed roughly three-quarters of that incremental capacity. Meanwhile, coal generation still supplied about 35% of world electricity in 2023, underscoring the dual pace of transition across regions.`,
    `Labor markets in knowledge work also shifted. LinkedIn's workforce reports indicated that AI-related job postings in the US grew more than 30% year over year into 2024, while hiring for traditional software roles cooled. Gallup's State of the Global Workplace estimated that only 23% of employees were engaged at work in 2023, with regional engagement ranging from the low teens to the mid-30s.`,
    `Education outcomes remain uneven after pandemic disruptions. UNESCO estimated that more than 240 million children and youth were still out of school globally in recent reporting years. OECD PISA 2022 results showed average mathematics scores declining across many member countries relative to 2018 baselines. In the US, NAEP long-term trend assessments found that 13-year-olds' reading scores fell several points compared with pre-pandemic assessments.`,
    `Public health indicators show mixed progress. WHO estimates place hypertension prevalence among adults aged 30–79 at around 33% globally. The Global Burden of Disease study has attributed millions of premature deaths annually to elevated systolic blood pressure each year. Vaccination coverage for measles first dose recovered toward 83% in 2022 after dipping during COVID-19 disruptions, according to UNICEF–WHO joint reporting.`,
    `I believe policymakers should treat digital infrastructure as a public good rather than a purely commercial asset. In my view, the next decade will reward institutions that combine credible statistics with clear narrative. We should prioritize open data standards so that surveys from Statista, national statistical offices, and academic consortia can be compared more easily.`,
  ]
  return paras.join('\n\n')
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    persona: 'undergrad-psych',
    label: 'Undergrad psych lab write-up',
    why: 'Classic student draft with stats + methods claims.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 2, maxClaims: 6, minEnrichmentRate: 0.8, latencyTargetMs: 45_000 },
    essay: `Working memory capacity predicts academic achievement in first-year university students.
In one large sample, students with higher working memory scores obtained GPA gains of roughly 0.3 points after controlling for prior attainment.
Dual-task interference reliably reduces recall accuracy in laboratory tasks that require simultaneous storage and processing.
I will discuss implications for first-year mentoring programs in the final section.`,
  },
  {
    id: 2,
    persona: 'business-brand',
    label: 'Brand strategy memo with invented product',
    why: 'Essay-specific brand must not pollute OpenAlex queries.',
    allowChunked: true,
    settings: {
      styleId: 'harvard',
      inText: true,
      suggestCorrections: false,
      recency: '10y',
      sourceTier: 'any',
    },
    expect: {
      minClaims: 1,
      maxClaims: 5,
      brandBan: ['Bacco', 'GlowShelf'],
      mustSkip: ['We recommend that Bacco'],
      minEnrichmentRate: 0.8,
      latencyTargetMs: 45_000,
    },
    essay: `Lighting forms a large part of the atmospheric in-store experience, and is one aspect that creates an impactful effect on how Bacco is perceived.
Warm colour temperatures are associated with longer dwell time and higher purchase intention in retail environments.
GlowShelf, our proprietary fixture line, will launch in Q4 across flagship stores.
We recommend that Bacco prioritise ambient lighting over promotional spotlights in the tasting area.`,
  },
  {
    id: 3,
    persona: 'current-news',
    label: 'Policy brief with recent events',
    why: 'Should route toward news/web rather than journals only.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: '5y',
      sourceTier: 'any',
    },
    expect: {
      minClaims: 1,
      maxClaims: 5,
      preferNews: true,
      minEnrichmentRate: 0.8,
      latencyTargetMs: 45_000,
    },
    essay: `In 2024, several national governments announced new industrial policies aimed at onshoring semiconductor manufacturing.
The CHIPS and Science Act allocated tens of billions of dollars in incentives for domestic chip fabrication in the United States.
Supply-chain shocks during the pandemic revealed how concentrated advanced lithography capacity had become.
Policymakers should treat fabrication capacity as strategic infrastructure rather than a purely commercial choice.`,
  },
  {
    id: 4,
    persona: 'opinion-only',
    label: 'Personal reflection / no facts',
    why: 'Should return zero citation targets.',
    allowChunked: true,
    settings: {
      styleId: 'mla',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'any',
    },
    expect: { minClaims: 0, maxClaims: 0, latencyTargetMs: 30_000 },
    essay: `I believe university is mostly about learning how to learn.
In my view, the best classrooms feel collaborative rather than competitive.
I plan to keep a weekly reading journal because it helps me stay organised.
Overall, I prefer seminars to large lectures, and I think that preference will shape my course choices next year.`,
  },
  {
    id: 5,
    persona: 'medical',
    label: 'Public health / clinical claim',
    why: 'Should set medical=true and prefer scholarly/clinical sources.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: true,
      recency: '10y',
      sourceTier: 'academic',
    },
    expect: {
      medical: true,
      minClaims: 2,
      maxClaims: 6,
      minEnrichmentRate: 0.8,
      latencyTargetMs: 45_000,
    },
    essay: `Hypertension remains one of the leading modifiable risk factors for cardiovascular disease worldwide.
Lifestyle interventions that combine sodium reduction with regular aerobic exercise produce clinically meaningful reductions in systolic blood pressure.
ACE inhibitors are widely used as first-line pharmacotherapy for many adults with essential hypertension.
Community blood-pressure screening programmes can improve early detection in underserved neighbourhoods.`,
  },
  {
    id: 6,
    persona: 'legal',
    label: 'Undergraduate constitutional law essay',
    why: 'Should set legal=true; doctrine claims need sources.',
    allowChunked: true,
    settings: {
      styleId: 'bluebook',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'any',
    },
    expect: {
      legal: true,
      minClaims: 1,
      maxClaims: 5,
      minEnrichmentRate: 0.8,
      latencyTargetMs: 45_000,
    },
    essay: `Strict scrutiny requires the government to show that a law is narrowly tailored to a compelling interest.
In equal protection analysis, classifications based on race trigger the highest level of judicial review.
I argue that the Court should apply intermediate scrutiny more consistently to gender classifications.
The opinion writing style of the modern Court has also become more fragmented through concurrences.`,
  },
  {
    id: 7,
    persona: 'pre-cited',
    label: 'Draft that already has APA in-text cites',
    why: 'Should detect existing citations and try to resolve them.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 1, maxClaims: 4, minEnrichmentRate: 0.8, latencyTargetMs: 45_000 },
    essay: `Social identity theory proposes that people derive part of their self-concept from group memberships (Tajfel & Turner, 1979).
Intergroup bias can intensify under conditions of resource competition (Sherif, 1966).
I will next outline how these ideas apply to online communities.
Future work should test whether anonymity amplifies out-group hostility.`,
  },
  {
    id: 8,
    persona: 'messy-paste',
    label: 'Messy Word paste with soft wraps',
    why: 'Alignment and soft-wrap merge must keep claim text locatable.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 1, maxClaims: 5, minEnrichmentRate: 0.8, latencyTargetMs: 45_000 },
    essay: `Climate models consistently show that anthropogenic greenhouse gas
emissions are the dominant driver of observed warming since the mid-20th century.
Arctic sea ice extent has declined substantially over recent decades, with
summer minima reaching record lows multiple times since 2000.
I think policymakers should treat adaptation funding as a moral duty, not only
an economic calculation.`,
  },
  {
    id: 9,
    persona: 'history',
    label: 'History survey essay',
    why: 'Historical assertions should prefer academic sources.',
    allowChunked: true,
    settings: {
      styleId: 'chicago-author-date',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 2, maxClaims: 6, minEnrichmentRate: 0.8, latencyTargetMs: 45_000 },
    essay: `The Black Death killed a substantial share of Europe's population in the mid-fourteenth century.
Labour shortages after the plague contributed to rising wages for surviving agricultural workers in parts of England.
Urban guilds used the crisis years to renegotiate privileges with civic authorities.
I conclude that demographic shock alone cannot explain later political change without institutional context.`,
  },
  {
    id: 10,
    persona: 'mixed-claims',
    label: 'STEM + product launch mix',
    why: 'Must separate transferable science from launch opinion/plan.',
    allowChunked: true,
    settings: {
      styleId: 'ieee',
      inText: true,
      suggestCorrections: false,
      recency: '5y',
      sourceTier: 'any',
    },
    expect: {
      minClaims: 1,
      maxClaims: 5,
      brandBan: ['NovaBeam'],
      mustSkip: ['NovaBeam will ship', 'We should market'],
      minEnrichmentRate: 0.8,
      latencyTargetMs: 45_000,
    },
    essay: `Lithium-ion batteries degrade faster when repeatedly charged to 100% state of charge.
Cycle life improves when charge voltage is limited and cells are kept near mid-state-of-charge during storage.
NovaBeam will ship a consumer power bank that claims 2000 full cycles under mixed load.
We should market the product around longevity rather than peak wattage.`,
  },
  {
    id: 11,
    persona: 'dense-stats',
    label: 'Dense Statista-style Pro draft (~1.6k words)',
    why: 'Stresses parallel Phase A chunking + Phase B enrich under plan success criteria.',
    allowChunked: true,
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: '5y',
      sourceTier: 'any',
    },
    expect: {
      minClaims: 12,
      maxClaims: 45,
      mustSkip: ['I believe policymakers should treat digital infrastructure'],
      minEnrichmentRate: 0.85,
      latencyTargetMs: 50_000,
      latencyHardMs: 120_000,
    },
    essay: denseStatsEssay(),
  },
]

function brandLeak(
  sentence: AnalyzedSentence,
  banned: string[],
): string[] {
  const hay = [
    ...(sentence.keywords ?? []),
    sentence.academicQuery ?? '',
    sentence.webQuery ?? '',
    sentence.embeddingFocus ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return banned.filter((b) => hay.includes(b.toLowerCase()))
}

function enrichmentComplete(s: AnalyzedSentence): boolean {
  return claimQueryFromAnalyzed(s) != null
}

function letterGrade(score: number): string {
  if (score >= 95) return 'A'
  if (score >= 90) return 'A-'
  if (score >= 85) return 'B+'
  if (score >= 80) return 'B'
  if (score >= 75) return 'B-'
  if (score >= 70) return 'C+'
  if (score >= 65) return 'C'
  if (score >= 60) return 'C-'
  if (score >= 50) return 'D'
  return 'F'
}

async function runScenario(scenario: Scenario) {
  const t0 = Date.now()
  const issues: string[] = []
  const notes: string[] = []
  const words = countWords(scenario.essay)

  let analysis
  let fatal: string | undefined
  try {
    analysis = await analyzeEssayForCitations(scenario.essay, scenario.settings, {
      allowChunked: scenario.allowChunked,
    })
  } catch (err) {
    fatal = err instanceof Error ? err.message : String(err)
    const analyzeMs = Date.now() - t0
    // Opinion-only empty list is OK; dense drafts throwing is an issue (hard guard).
    if (scenario.expect.maxClaims === 0) {
      notes.push(`Analyze threw (unexpected for opinion draft): ${fatal}`)
      issues.push(fatal)
    } else if (scenario.persona === 'dense-stats' || (scenario.expect.minClaims ?? 0) >= 2) {
      // Hard guard may throw instead of false empty — count as partial credit path if message is retry.
      if (/couldn't finish analysis|try again/i.test(fatal)) {
        issues.push(`Hard-failed empty analyze (good guard, still a miss): ${fatal}`)
      } else {
        issues.push(`Analyze crashed: ${fatal}`)
      }
    } else {
      issues.push(`Analyze crashed: ${fatal}`)
    }
    return {
      id: scenario.id,
      persona: scenario.persona,
      label: scenario.label,
      why: scenario.why,
      words,
      analyzeMs,
      medical: false,
      legal: false,
      reasoningPreview: '',
      rawSentenceCount: 0,
      alignedCount: 0,
      enrichmentRate: null,
      selected: [],
      issues,
      notes,
      score: Math.max(0, 100 - issues.length * 15),
      letter: letterGrade(Math.max(0, 100 - issues.length * 15)),
      fatal,
    }
  }

  const aligned = alignSentencesToEssay(scenario.essay, analysis.sentences)
  const analyzeMs = Date.now() - t0

  if (scenario.expect.medical === true && !analysis.medical) {
    issues.push('Expected medical=true but got false.')
  }
  if (scenario.expect.legal === true && !analysis.legal) {
    issues.push('Expected legal=true but got false.')
  }
  if (scenario.expect.minClaims != null && aligned.length < scenario.expect.minClaims) {
    issues.push(`Too few claims: got ${aligned.length}, expected ≥ ${scenario.expect.minClaims}.`)
  }
  if (scenario.expect.maxClaims != null && aligned.length > scenario.expect.maxClaims) {
    issues.push(`Too many claims: got ${aligned.length}, expected ≤ ${scenario.expect.maxClaims}.`)
  }
  if (aligned.length !== analysis.sentences.length) {
    notes.push(
      `Alignment dropped ${analysis.sentences.length - aligned.length} of ${analysis.sentences.length} analyze sentences.`,
    )
  }

  for (const needle of scenario.expect.mustSkip ?? []) {
    const hit = aligned.some((s) => s.text.toLowerCase().includes(needle.toLowerCase()))
    if (hit) issues.push(`Selected a sentence that should be skipped (matched “${needle}”).`)
  }

  const leaks: string[] = []
  for (const s of aligned) {
    leaks.push(...brandLeak(s, scenario.expect.brandBan ?? []))
  }
  const uniqueLeaks = [...new Set(leaks)]
  if (uniqueLeaks.length) {
    issues.push(`Brand/query leak: ${uniqueLeaks.join(', ')}`)
  }

  if (scenario.expect.preferNews) {
    const hasNews = aligned.some((s) => s.claimType === 'news')
    if (!hasNews) {
      issues.push('Expected at least one claimType=news for current-events draft.')
    }
  }

  const existingDetected = aligned.filter((s) => Boolean(s.existingCitation)).length
  if (scenario.persona === 'pre-cited' && existingDetected === 0) {
    issues.push('Failed to detect existing in-text citations.')
  }

  const enriched = aligned.filter(enrichmentComplete).length
  const enrichmentRate = aligned.length ? enriched / aligned.length : null
  if (
    scenario.expect.minEnrichmentRate != null &&
    enrichmentRate != null &&
    enrichmentRate < scenario.expect.minEnrichmentRate
  ) {
    issues.push(
      `Weak Phase B enrichment: ${(enrichmentRate * 100).toFixed(0)}% complete, expected ≥ ${(scenario.expect.minEnrichmentRate * 100).toFixed(0)}%.`,
    )
  }

  if (scenario.expect.latencyTargetMs != null && analyzeMs > scenario.expect.latencyTargetMs) {
    notes.push(
      `Slow analyze (${Math.round(analyzeMs / 1000)}s vs ${Math.round(scenario.expect.latencyTargetMs / 1000)}s target).`,
    )
  }
  if (scenario.expect.latencyHardMs != null && analyzeMs > scenario.expect.latencyHardMs) {
    issues.push(
      `Analyze exceeded hard latency budget: ${Math.round(analyzeMs / 1000)}s > ${Math.round(scenario.expect.latencyHardMs / 1000)}s.`,
    )
  }

  // Heuristic quality score 0–100 (analyze-only)
  let score = 100
  score -= issues.length * 12
  if (analyzeMs > (scenario.expect.latencyTargetMs ?? 45_000)) score -= 5
  if (analyzeMs > (scenario.expect.latencyTargetMs ?? 45_000) * 1.5) score -= 5
  if (enrichmentRate != null && enrichmentRate < 1) {
    score -= Math.round((1 - enrichmentRate) * 15)
  }
  if (aligned.length === 0 && (scenario.expect.minClaims ?? 0) > 0) score -= 10
  score = Math.max(0, Math.min(100, score))

  return {
    id: scenario.id,
    persona: scenario.persona,
    label: scenario.label,
    why: scenario.why,
    words,
    analyzeMs,
    medical: analysis.medical,
    legal: analysis.legal,
    reasoningPreview: analysis.reasoning.slice(0, 280),
    rawSentenceCount: analysis.sentences.length,
    alignedCount: aligned.length,
    enrichmentRate,
    selected: aligned.map((s) => ({
      index: s.index,
      claimType: s.claimType,
      text: s.text.slice(0, 160),
      reason: s.reason?.slice(0, 120),
      enriched: enrichmentComplete(s),
      academicQuery: s.academicQuery?.slice(0, 100),
      existingCitation: s.existingCitation ?? null,
    })),
    issues,
    notes,
    score,
    letter: letterGrade(score),
  }
}

async function main() {
  if (!isLlmConfigured()) {
    console.error('AI_GATEWAY_API_KEY missing; cannot run analyze self-training.')
    process.exit(1)
  }

  const onlyRaw = process.env.SELF_TRAIN_ONLY?.trim()
  const onlyIds = onlyRaw
    ? new Set(
        onlyRaw
          .split(/[,:\s]+/)
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n) && n > 0),
      )
    : null
  const scenarios = onlyIds?.size
    ? SCENARIOS.filter((s) => onlyIds.has(s.id))
    : SCENARIOS

  console.log(`Analyze-only self-training: ${scenarios.length} scenarios…\n`)
  if (onlyIds?.size) console.log(`Filtered to: ${[...onlyIds].join(', ')}\n`)

  const runs = []
  for (const scenario of scenarios) {
    console.log(
      `── ${scenario.id}/${SCENARIOS.length} · ${scenario.label} (${countWords(scenario.essay)} words)`,
    )
    const result = await runScenario(scenario)
    runs.push(result)
    console.log(
      `   grade=${result.letter} score=${result.score} claims=${result.alignedCount}` +
        (result.enrichmentRate != null
          ? ` enrich=${Math.round(result.enrichmentRate * 100)}%`
          : '') +
        ` ${Math.round(result.analyzeMs / 1000)}s issues=${result.issues.length}`,
    )
    for (const issue of result.issues) console.log(`   ! ${issue}`)
    for (const note of result.notes) console.log(`   · ${note}`)
  }

  const avgScore =
    runs.reduce((sum, r) => sum + (typeof r.score === 'number' ? r.score : 0), 0) / runs.length
  const avgMs =
    runs.reduce((sum, r) => sum + (typeof r.analyzeMs === 'number' ? r.analyzeMs : 0), 0) /
    runs.length
  const passCount = runs.filter((r) => (r.issues?.length ?? 0) === 0).length

  const improvementBuckets: Record<string, { count: number; examples: string[] }> = {}
  function bump(key: string, example: string) {
    if (!improvementBuckets[key]) improvementBuckets[key] = { count: 0, examples: [] }
    improvementBuckets[key].count += 1
    if (improvementBuckets[key].examples.length < 4) {
      improvementBuckets[key].examples.push(example)
    }
  }

  for (const r of runs) {
    for (const issue of r.issues ?? []) {
      if (/medical|legal/i.test(issue)) bump('Medical/legal routing flags', `Run ${r.id}: ${issue}`)
      else if (/Brand|leak/i.test(issue)) bump('Brand leakage into search queries', `Run ${r.id}: ${issue}`)
      else if (/skip/i.test(issue)) bump('Opinion/plan claim filtering', `Run ${r.id}: ${issue}`)
      else if (/Too few|Too many/i.test(issue)) bump('Claim selection volume', `Run ${r.id}: ${issue}`)
      else if (/existing in-text/i.test(issue)) bump('Existing citation detection', `Run ${r.id}: ${issue}`)
      else if (/enrichment/i.test(issue)) bump('Phase B claim enrichment', `Run ${r.id}: ${issue}`)
      else if (/latency|hard latency/i.test(issue)) bump('Latency budget', `Run ${r.id}: ${issue}`)
      else if (/Hard-failed|crashed|couldn't finish/i.test(issue))
        bump('Hard-fail / empty analyze', `Run ${r.id}: ${issue}`)
      else if (/news/i.test(issue)) bump('News claimType routing', `Run ${r.id}: ${issue}`)
      else bump('Other analyze issues', `Run ${r.id}: ${issue}`)
    }
    for (const note of r.notes ?? []) {
      if (/Alignment dropped/i.test(note))
        bump('Sentence alignment / locate', `Run ${r.id}: ${note}`)
      else if (/Slow analyze/i.test(note)) bump('Latency budget', `Run ${r.id}: ${note}`)
    }
  }

  const improvements = [
    ...Object.entries(improvementBuckets)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([key, v]) => ({
        priority: v.count >= 3 ? 'high' : v.count === 2 ? 'medium' : 'low',
        area: key,
        count: v.count,
        examples: v.examples,
        suggestion:
          key === 'Claim selection volume'
            ? 'Tighten Phase A prompts for dense stats recall; lower under-recall compact-retry threshold.'
            : key === 'Latency budget'
              ? 'Raise Phase B concurrency slightly or skip re-enrich when Phase A already emitted claim fields.'
              : key === 'Phase B claim enrichment'
                ? 'Ensure enrich always writes keywords/academicQuery/webQuery; log heuristic fallback rate.'
                : key === 'News claimType routing'
                  ? 'Strengthen preferNewsClaimType heuristics for Acts / dollar amounts / year-stamped policy.'
                  : key === 'Medical/legal routing flags'
                    ? 'OR chunk flags more aggressively; expand inferSubjectFlags keyword lists.'
                    : key === 'Brand leakage into search queries'
                      ? 'Strip essay-specific entities after Phase B as well as in claimQueryFromAnalyzed.'
                      : key === 'Opinion/plan claim filtering'
                        ? 'Add explicit Phase A skip cues for recommend/will ship/I believe sentences.'
                        : key === 'Existing citation detection'
                          ? 'Run deterministic author-year regex before/after LLM identify.'
                          : key === 'Sentence alignment / locate'
                            ? 'Widen fuzzy window further for soft-wrapped stats sentences.'
                            : key === 'Hard-fail / empty analyze'
                              ? 'Investigate Phase A empty returns; ensure salvage + compact paths fire earlier.'
                              : 'Review scenario failures and add regression fixtures.',
      })),
    {
      priority: 'medium' as const,
      area: 'Eval coverage',
      count: 0,
      examples: [],
      suggestion:
        'Keep this analyze-only harness in CI smoke (1–2 scenarios) and full suite pre-release.',
    },
  ]

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'analyze-only',
    summary: {
      runs: runs.length,
      passCount,
      avgScore: Number(avgScore.toFixed(1)),
      letter: letterGrade(avgScore),
      avgAnalyzeMs: Math.round(avgMs),
      denseStats: runs.find((r) => r.id === 11) ?? null,
    },
    improvementBuckets,
    improvements,
    runs,
  }

  const outPath = resolve(process.cwd(), 'scripts/self-train-analyze-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log(
    `Grade ${report.summary.letter} · avg ${report.summary.avgScore} · pass ${passCount}/${runs.length} · avg ${Math.round(avgMs / 1000)}s`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
