/**
 * Offline self-training harness: 10 varied essays → analyze → cite (capped) → score.
 *
 * Usage: npx tsx --env-file=.env.local scripts/self-train-pipeline.mts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeEssayForCitations, claimQueryFromAnalyzed } from '../lib/cite/analyze'
import { findCitationForSentence } from '../lib/cite/pipeline'
import { createCitationSearchCache } from '../lib/cite/searchCache'
import { alignSentencesToEssay } from '../lib/essay/alignSentences'
import { generateEssayTitle } from '../lib/essay/title'
import { entitlementsForPlan } from '../lib/billing/entitlements'
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

interface Scenario {
  id: number
  persona: Persona
  label: string
  why: string
  settings: GenerationSettings
  expect: {
    medical?: boolean
    legal?: boolean
    minClaims?: number
    maxClaims?: number
    /** Claims that must NOT be selected (substring match on essay sentence). */
    mustSkip?: string[]
    /** Brand / project terms that must not leak into search queries. */
    brandBan?: string[]
    /** Prefer news routing for at least one selected claim. */
    preferNews?: boolean
    /** Reject cite titles matching these patterns (wrong resolve / off-topic). */
    rejectTitlePatterns?: RegExp[]
  }
  essay: string
}

const SCENARIOS: Scenario[] = [
  {
    id: 1,
    persona: 'undergrad-psych',
    label: 'Undergrad psych lab write-up',
    why: 'Classic student draft with stats + methods claims.',
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 2, maxClaims: 6 },
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
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: '5y',
      sourceTier: 'any',
    },
    expect: { minClaims: 1, maxClaims: 5, preferNews: true },
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
    settings: {
      styleId: 'mla',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'any',
    },
    expect: { minClaims: 0, maxClaims: 0 },
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
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: true,
      recency: '10y',
      sourceTier: 'academic',
    },
    expect: { medical: true, minClaims: 2, maxClaims: 6 },
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
      rejectTitlePatterns: [
        /religious freedom restoration|\bfaith profaned\b|\brfra\b|religion in the prisons/i,
      ],
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
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: {
      minClaims: 1,
      maxClaims: 4,
      rejectTitlePatterns: [
        /heteroatomic/i,
        /phosphorus/i,
        /inorganic compounds/i,
        /boron/i,
      ],
    },
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
    settings: {
      styleId: 'apa',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 1, maxClaims: 5 },
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
    settings: {
      styleId: 'chicago-author-date',
      inText: true,
      suggestCorrections: false,
      recency: 'any',
      sourceTier: 'academic',
    },
    expect: { minClaims: 2, maxClaims: 6 },
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
    },
    essay: `Lithium-ion batteries degrade faster when repeatedly charged to 100% state of charge.
Cycle life improves when charge voltage is limited and cells are kept near mid-state-of-charge during storage.
NovaBeam will ship a consumer power bank that claims 2000 full cycles under mixed load.
We should market the product around longevity rather than peak wattage.`,
  },
]

const MAX_CITE_PER_ESSAY = 2
const entitlements = entitlementsForPlan('pro')

function brandLeak(sentence: {
  text: string
  keywords?: string[]
  academicQuery?: string
  webQuery?: string
  embeddingFocus?: string
  entities?: string[]
}, banned: string[]): string[] {
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

async function runScenario(scenario: Scenario) {
  const t0 = Date.now()
  const issues: string[] = []
  const notes: string[] = []

  const analysis = await analyzeEssayForCitations(scenario.essay, scenario.settings)
  const aligned = alignSentencesToEssay(scenario.essay, analysis.sentences)
  const title = await generateEssayTitle(scenario.essay)
  const analyzeMs = Date.now() - t0

  if (scenario.expect.medical === true && !analysis.medical) {
    issues.push('Expected medical=true but got false.')
  }
  if (scenario.expect.medical === false && analysis.medical) {
    issues.push('Unexpected medical=true.')
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
  if (title === 'Untitled draft' || !title.trim()) {
    issues.push('Title generation returned placeholder.')
  }

  for (const needle of scenario.expect.mustSkip ?? []) {
    const hit = aligned.some((s) => s.text.toLowerCase().includes(needle.toLowerCase()))
    if (hit) issues.push(`Selected a sentence that should be skipped (matched “${needle}”).`)
  }

  const leaks: string[] = []
  for (const s of aligned) {
    const banned = scenario.expect.brandBan ?? []
    leaks.push(...brandLeak(s, banned))
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

  const citeTargets = aligned.slice(0, MAX_CITE_PER_ESSAY)
  const citeResults: Array<{
    index: number
    status: string
    claimType?: string
    title?: string
    errorMessage?: string
    possibleMatches?: number
    stages: string[]
    ms: number
  }> = []

  const searchCache = createCitationSearchCache()
  const shared: { id: string }[] = []
  const allSources: never[] = []

  for (const s of citeTargets) {
    const stages: string[] = []
    const c0 = Date.now()
    try {
      const result = await findCitationForSentence({
        sentence: s.text,
        settings: {
          ...scenario.settings,
          medical: analysis.medical,
          legal: analysis.legal,
        },
        entitlements,
        priorSourceIds: shared.map((x) => x.id),
        allSourcesSoFar: allSources as never[],
        claimType: s.claimType,
        claimQuery: claimQueryFromAnalyzed(s),
        analyzedSentence: s,
        searchCache,
        onStage: (stage) => {
          stages.push(stage)
        },
      })
      if (result.status === 'done' && result.record?.id) {
        shared.push({ id: result.record.id })
      }
      citeResults.push({
        index: s.index,
        status: result.status,
        claimType: s.claimType,
        title: result.record?.title,
        errorMessage: result.errorMessage,
        possibleMatches: result.possibleMatches?.length ?? 0,
        stages,
        ms: Date.now() - c0,
      })
      if (result.status === 'failed') {
        notes.push(
          `Miss Sentence ${s.index + 1}: ${result.errorMessage || 'no reason'} (near-misses: ${result.possibleMatches?.length ?? 0})`,
        )
      }
    } catch (err) {
      citeResults.push({
        index: s.index,
        status: 'error',
        claimType: s.claimType,
        errorMessage: err instanceof Error ? err.message : String(err),
        stages,
        ms: Date.now() - c0,
      })
      issues.push(`Cite crash on Sentence ${s.index + 1}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  for (const pattern of scenario.expect.rejectTitlePatterns ?? []) {
    for (const cite of citeResults) {
      if (cite.title && pattern.test(cite.title)) {
        issues.push(`Wrong/off-topic cite title matched ${pattern}: “${cite.title}”.`)
      }
    }
  }

  const done = citeResults.filter((c) => c.status === 'done').length
  const attempted = citeResults.length
  const citeRate = attempted ? done / attempted : null

  // Heuristic quality score 0–100
  let score = 100
  score -= issues.length * 12
  if (citeRate != null) score -= Math.round((1 - citeRate) * 20)
  if (analyzeMs > 45_000) {
    notes.push(`Slow analyze (${Math.round(analyzeMs / 1000)}s).`)
    score -= 5
  }
  score = Math.max(0, Math.min(100, score))

  return {
    id: scenario.id,
    persona: scenario.persona,
    label: scenario.label,
    why: scenario.why,
    title,
    analyzeMs,
    medical: analysis.medical,
    legal: analysis.legal,
    reasoningPreview: analysis.reasoning.slice(0, 280),
    rawSentenceCount: analysis.sentences.length,
    alignedCount: aligned.length,
    selected: aligned.map((s) => ({
      index: s.index,
      claimType: s.claimType,
      text: s.text.slice(0, 140),
      reason: s.reason?.slice(0, 120),
      academicQuery: s.academicQuery?.slice(0, 100),
      existingCitation: s.existingCitation ?? null,
    })),
    citeResults,
    citeRate,
    issues,
    notes,
    score,
  }
}

async function main() {
  if (!isLlmConfigured()) {
    console.error('AI_GATEWAY_API_KEY missing; cannot run self-training.')
    process.exit(1)
  }

  console.log(`Starting self-training: ${SCENARIOS.length} scenarios (max ${MAX_CITE_PER_ESSAY} cites each)…\n`)

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
  if (onlyIds?.size) {
    console.log(`Filtered to scenarios: ${[...onlyIds].join(', ')}\n`)
  }

  const runs = []
  for (const scenario of scenarios) {
    console.log(`── Run ${scenario.id}/10 · ${scenario.label}`)
    try {
      const result = await runScenario(scenario)
      runs.push(result)
      console.log(
        `   score=${result.score} claims=${result.alignedCount} cite=${result.citeResults.map((c) => c.status).join(',') || 'n/a'} issues=${result.issues.length}`,
      )
      for (const issue of result.issues) console.log(`   ! ${issue}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`   FATAL: ${message}`)
      runs.push({
        id: scenario.id,
        persona: scenario.persona,
        label: scenario.label,
        why: scenario.why,
        fatal: message,
        score: 0,
        issues: [message],
        notes: [],
        citeResults: [],
        alignedCount: 0,
        citeRate: null,
      })
    }
  }

  const avgScore =
    runs.reduce((sum, r) => sum + (typeof r.score === 'number' ? r.score : 0), 0) / runs.length
  const citeAttempted = runs.flatMap((r) => ('citeResults' in r ? r.citeResults : []) as Array<{ status: string }>)
  const citeDone = citeAttempted.filter((c) => c.status === 'done').length

  const improvementBuckets: Record<string, { count: number; examples: string[] }> = {}
  function bump(key: string, example: string) {
    if (!improvementBuckets[key]) improvementBuckets[key] = { count: 0, examples: [] }
    improvementBuckets[key].count += 1
    if (improvementBuckets[key].examples.length < 3) improvementBuckets[key].examples.push(example)
  }

  for (const r of runs) {
    for (const issue of r.issues ?? []) {
      if (/medical/i.test(issue)) bump('Medical/legal routing flags', `Run ${r.id}: ${issue}`)
      else if (/legal/i.test(issue)) bump('Medical/legal routing flags', `Run ${r.id}: ${issue}`)
      else if (/Brand|leak/i.test(issue)) bump('Brand leakage into search queries', `Run ${r.id}: ${issue}`)
      else if (/skip/i.test(issue)) bump('Opinion/plan claim filtering', `Run ${r.id}: ${issue}`)
      else if (/Too few|Too many/i.test(issue)) bump('Claim selection volume', `Run ${r.id}: ${issue}`)
      else if (/existing in-text/i.test(issue)) bump('Existing citation detection', `Run ${r.id}: ${issue}`)
      else if (/Title/i.test(issue)) bump('Title generation', `Run ${r.id}: ${issue}`)
      else if (/Cite crash/i.test(issue)) bump('Pipeline reliability / crashes', `Run ${r.id}: ${issue}`)
      else bump('Other analyze issues', `Run ${r.id}: ${issue}`)
    }
    for (const note of r.notes ?? []) {
      if (/Alignment dropped/i.test(note)) bump('Sentence alignment / paraphrase mismatch', `Run ${r.id}: ${note}`)
      else if (/Miss Sentence/i.test(note)) bump('Citation miss rate / verify strictness', `Run ${r.id}: ${note}`)
      else if (/Slow analyze/i.test(note)) bump('Latency', `Run ${r.id}: ${note}`)
    }
    if ('citeRate' in r && r.citeRate != null && r.citeRate < 1) {
      bump('Citation miss rate / verify strictness', `Run ${r.id}: cite rate ${(r.citeRate * 100).toFixed(0)}%`)
    }
  }

  // Structural QoL suggestions always considered after seeing patterns
  const alwaysOnIdeas = [
    'Feed copy: surface miss reason + near-miss titles more prominently when verify fails.',
    'Analyze: stream incremental status (claims found so far) instead of waiting for full structured JSON.',
    'Cite: when existingCitation is present, short-circuit to resolve-only path and skip discovery when resolve succeeds.',
    'Alignment: if locate fails, fuzzy-match by longest common subsequence rather than dropping the claim.',
    'Brand guard: strip isLikelyEssaySpecificEntity from academicQuery/webQuery after model output (already partial) and log when stripped.',
    'Eval harness: keep this script and add golden fixtures for mustSkip / brandBan regressions.',
  ]

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      runs: runs.length,
      avgScore: Number(avgScore.toFixed(1)),
      citeAttempted: citeAttempted.length,
      citeDone,
      citeSuccessRate:
        citeAttempted.length > 0 ? Number((citeDone / citeAttempted.length).toFixed(3)) : null,
    },
    improvementBuckets,
    alwaysOnIdeas,
    runs,
  }

  const outPath = resolve(process.cwd(), 'scripts/self-train-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log(
    `Avg score ${report.summary.avgScore} · cite success ${report.summary.citeDone}/${report.summary.citeAttempted}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
