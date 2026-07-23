/**
 * Focused Analyze eval: 5 long dense drafts (chunking + speed) + 3 opinion-only (no hard-fail).
 *
 * Usage: npx tsx --env-file=.env.local scripts/self-train-analyze-stress.mts
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

const SETTINGS: GenerationSettings = {
  styleId: 'apa',
  inText: true,
  suggestCorrections: false,
  recency: '5y',
  sourceTier: 'any',
}

const CHUNK_THRESHOLD = 900
const CHUNK_WORDS = 700
const DENSE_LATENCY_TARGET_MS = 60_000
const DENSE_LATENCY_HARD_MS = 120_000

function estimateChunks(words: number): number {
  if (words <= CHUNK_THRESHOLD) return 1
  return Math.max(2, Math.ceil(words / CHUNK_WORDS))
}

function joinParas(paras: string[]): string {
  return paras.map((p) => p.trim()).filter(Boolean).join('\n\n')
}

/** Expand topic paragraphs until word count is in [minWords, maxWords]. */
function expandToWords(seedParas: string[], minWords: number, maxWords = minWords + 400): string {
  const fillers = [
    `Industry trackers note that year-over-year comparisons remain sensitive to exchange-rate swings, and 2023–2024 revisions shifted reported growth by 1–3 percentage points in several series.`,
    `Regional breakdowns show emerging markets contributed roughly 55–65% of incremental unit volume even as average selling prices stayed $120–$200 below mature-economy levels.`,
    `Analysts caution that survey-based estimates can diverge from administrative data by 5–15% when segment definitions change mid-year across vendors.`,
    `Peer-reviewed syntheses generally treat these headline figures as directional; confidence intervals around national aggregates often span ±2–4 percentage points.`,
    `The scale of the reported shifts — often double-digit percent changes over a decade — is large enough that citation-backed claims are warranted in academic writing.`,
    `Cross-checks against customs and shipment registries sometimes revise preliminary quarterly prints by $2–8 billion for large categories.`,
    `Methodological notes in the source releases emphasize that seasonally adjusted series can move 0.5–1.5 points after delayed response weights are applied.`,
    `Comparative tables across Statista, national statistical offices, and trade associations still disagree on coverage of informal channels that may represent 10–20% of volume in some markets.`,
  ]
  const paras = [...seedParas]
  let i = 0
  while (countWords(joinParas(paras)) < minWords) {
    paras.push(fillers[i % fillers.length]!)
    i += 1
    if (i > 80) break
  }
  let text = joinParas(paras)
  while (countWords(text) > maxWords && paras.length > seedParas.length) {
    paras.pop()
    text = joinParas(paras)
  }
  return text
}

function denseDigitalEconomy(): string {
  return expandToWords(
    [
      `Global smartphone shipments reached 1.24 billion units in 2024 according to industry trackers, recovering from three consecutive years of contraction. Statista reports that Apple held roughly 18% of worldwide unit share in Q4 2024 while Samsung remained near 19%. Average selling prices rose to about $410 per device in premium segments, even as entry-level Android ASPs stayed below $180 in emerging markets.`,
      `In the United States, Pew Research Center surveys from 2023 found that 97% of adults under 30 own a smartphone, compared with 76% of adults aged 65 and older. Mobile advertising spend crossed $180 billion globally in 2024, with retail and consumer electronics accounting for nearly one-third of that total. App Annie (data.ai) estimated that consumers spent $171 billion in app stores during 2023, up 3% year over year.`,
      `E-commerce penetration continued to climb: UNCTAD estimated that business-to-consumer online sales represented 19% of total retail trade in developed economies in 2022. In Southeast Asia, Google–Temasek–Bain e-Conomy reports put the digital economy at $263 billion in GMV for 2024, with e-commerce contributing more than half. Indonesia alone accounted for roughly $82 billion of that GMV.`,
      `Logistics and last-mile delivery remain capacity constraints. McKinsey analysis has suggested that parcel volumes in major cities may grow 8–10% annually through 2030 if omnichannel retail continues on its current path. Same-day delivery share reached 12% of online orders in top-tier US metros in 2024 according to industry consultancies, versus under 4% in mid-sized markets.`,
      `Cloud infrastructure spending exceeded $80 billion in a single quarter among the largest hyperscalers in 2024, according to earnings summaries compiled by financial press trackers. Enterprise surveys report that more than 60% of large firms now run at least one production workload on public cloud. Latency-sensitive workloads still keep an estimated 35–40% of compute on private data centers in regulated industries.`,
      `Cybersecurity budgets rose accordingly: Gartner estimated worldwide information-security spending near $215 billion in 2024. Ransomware incidents reported to national CERTs numbered in the thousands across OECD members, though underreporting remains common. Zero-trust architecture adoption was cited by roughly one in three surveyed CISOs as a top priority for the next fiscal year.`,
      `I believe policymakers should treat digital infrastructure as a public good rather than a purely commercial asset. In my view, open data standards would make Statista, national statistical offices, and academic consortia easier to compare.`,
    ],
    1600,
  )
}

function denseClimateEnergy(): string {
  return expandToWords(
    [
      `IEA data showed global renewable electricity generation capacity additions of about 510 GW in 2023, the highest annual figure on record. Solar photovoltaic alone contributed roughly three-quarters of that incremental capacity. Meanwhile, coal generation still supplied about 35% of world electricity in 2023, underscoring the dual pace of transition across regions.`,
      `CDP reported that over 23,000 companies disclosed environmental data through its platform in 2023. Science Based Targets initiative (SBTi) counted more than 4,000 companies with validated near-term targets by mid-2024. Scope 3 emissions often represent 70–90% of a consumer brand's footprint, which pushes suppliers toward renewable electricity purchasing.`,
      `Global average surface temperature in 2023 was approximately 1.45°C above the 1850–1900 baseline according to WMO assessments. Arctic sea ice extent minima have declined by roughly 12% per decade since satellite records began in 1979. Extreme heat days above the 90th percentile have become more frequent in mid-latitude cities, with some metros recording multi-week heat-wave clusters.`,
      `Electric vehicle sales surpassed 14 million units worldwide in 2023 according to IEA Global EV Outlook figures, representing about 18% of new car sales. Battery pack prices fell toward $139 per kWh on a volume-weighted average basis in recent reporting years. Charging infrastructure density remains uneven: several European countries exceed 1 public charger per 10 EVs, while others remain below 1 per 20.`,
      `Methane emissions from fossil fuel operations remain a high-leverage mitigation target. Satellite-based leak detection campaigns have identified super-emitter events releasing tens of tonnes of methane per hour at individual sites. The Global Methane Pledge aims for a 30% reduction in methane emissions from 2020 levels by 2030 among participating countries.`,
      `Adaptation finance still lags mitigation finance by a wide margin in multilateral climate funds. UNEP's Adaptation Gap reports have repeatedly estimated that developing-country adaptation needs run into the hundreds of billions of dollars annually by 2030. Nature-based solutions such as mangrove restoration can deliver coastal protection benefits estimated at several dollars of avoided damage per dollar invested in favorable sites.`,
      `I think communities should treat adaptation funding as a moral duty, not only an economic calculation.`,
    ],
    1600,
  )
}

function denseLaborEducation(): string {
  return expandToWords(
    [
      `LinkedIn workforce reports indicated that AI-related job postings in the US grew more than 30% year over year into 2024, while hiring for traditional software roles cooled. Gallup's State of the Global Workplace estimated that only 23% of employees were engaged at work in 2023, with regional engagement ranging from the low teens to the mid-30s.`,
      `UNESCO estimated that more than 240 million children and youth were still out of school globally in recent reporting years. OECD PISA 2022 results showed average mathematics scores declining across many member countries relative to 2018 baselines. In the US, NAEP long-term trend assessments found that 13-year-olds' reading scores fell several points compared with pre-pandemic assessments.`,
      `ILO modelled estimates place global youth unemployment near 13% in recent years, with substantial variation between regions. Informal employment still accounts for more than 50% of total employment in many lower-middle-income countries. Remittances to low- and middle-income countries exceeded $650 billion in a recent World Bank tracking year.`,
      `Remote work stabilized after pandemic peaks: surveys of knowledge workers in high-income countries often find that 25–40% of employees work hybrid schedules. Office vacancy rates in several major US CBDs remained above 15% in 2024 according to commercial brokerage reports. Commute times for hybrid workers fell by an estimated 30–60 minutes on remote days in metro studies.`,
      `STEM degree completions continue to rise in absolute terms, yet gender gaps persist in computing and engineering in many OECD systems. Apprenticeship starts in selected European economies recovered toward pre-pandemic volumes by 2023. Employer surveys report that roughly 40% of firms struggle to fill roles requiring advanced digital skills.`,
      `Adult learning participation remains low outside northern Europe. Eurostat figures often show that fewer than 15% of adults aged 25–64 participated in education or training in a four-week reference period in southern EU members. Micro-credential programmes grew rapidly on major platforms, with tens of millions of course enrollments annually.`,
      `We should prioritize mentoring over ranking tables when designing first-year university support.`,
    ],
    1600,
  )
}

function densePublicHealth(): string {
  return expandToWords(
    [
      `WHO estimates place hypertension prevalence among adults aged 30–79 at around 33% globally. The Global Burden of Disease study has attributed millions of premature deaths annually to elevated systolic blood pressure each year. Vaccination coverage for measles first dose recovered toward 83% in 2022 after dipping during COVID-19 disruptions, according to UNICEF–WHO joint reporting.`,
      `Lifestyle interventions that combine sodium reduction with regular aerobic exercise produce clinically meaningful reductions in systolic blood pressure in multiple randomized trials. ACE inhibitors remain widely used as first-line pharmacotherapy for many adults with essential hypertension. Community blood-pressure screening programmes can improve early detection in underserved neighbourhoods.`,
      `Diabetes prevalence among adults has risen above 10% in many high-income countries according to IDF Atlas estimates. Obesity rates in the United States exceed 40% of adults in recent NHANES cycles. Excess weight is associated with elevated risk of type 2 diabetes, osteoarthritis, and several cancers in epidemiological meta-analyses.`,
      `Antimicrobial resistance causes an estimated 1.27 million deaths directly attributable to resistant infections annually based on GRAM project analyses. Hospital antibiotic stewardship programmes have reduced inappropriate prescribing by double-digit percentages in multi-site evaluations. Access to second-line antimicrobials remains uneven across low-resource settings.`,
      `Mental health conditions account for a large share of years lived with disability worldwide. WHO estimates that depression and anxiety rose by more than 25% in the first year of the COVID-19 pandemic. Treatment gaps exceed 50% for common mental disorders in many countries, according to cross-national surveys.`,
      `Air pollution remains a leading environmental risk factor: ambient PM2.5 exposure is linked to millions of premature deaths annually in Global Burden of Disease estimates. Household air pollution from solid fuels still affects hundreds of millions of people, primarily in low-income countries. Clean cookstove programmes show mixed adherence and health outcomes across trials.`,
      `I hope clinics expand evening hours so working parents can attend screening visits more easily.`,
    ],
    1550,
  )
}

function denseTradePolicy(): string {
  return expandToWords(
    [
      `In 2024, several national governments announced new industrial policies aimed at onshoring semiconductor manufacturing. The CHIPS and Science Act allocated tens of billions of dollars in incentives for domestic chip fabrication in the United States. Supply-chain shocks during the pandemic revealed how concentrated advanced lithography capacity had become.`,
      `World merchandise trade volume grew by roughly 1–3% in recent WTO estimate years after the 2020 contraction. Container freight rates on major East–West lanes fell more than 70% from 2021 peaks by late 2023 according to freight index publishers. Nearshoring surveys report that 20–40% of multinational manufacturers relocated at least one node of production closer to end markets.`,
      `Foreign direct investment flows into developing economies remained uneven, with greenfield announcements in renewables and electronics outpacing traditional extractives in several UNCTAD tallies. Export controls on advanced AI chips reshaped procurement timelines for data-center operators. Dual-use technology screening lengthened licensing cycles by weeks to months in firm surveys.`,
      `Critical mineral demand for batteries is projected to rise several-fold by 2030 under IEA net-zero scenarios. Lithium, nickel, and cobalt supply concentration remains high, with the top three producers often accounting for more than half of refined output. Recycling rates for EV batteries are still below 10% of end-of-life mass in most jurisdictions.`,
      `Services trade in digitally deliverable sectors grew faster than goods trade in multiple OECD datasets. Cross-border e-commerce parcels numbered in the billions annually among major customs administrations. VAT and de minimis threshold reforms in the EU and elsewhere altered landed costs for low-value shipments.`,
      `Agricultural commodity prices remained volatile: FAO food price indices swung by double-digit percentages across 2021–2023. Fertilizer price spikes raised production costs for smallholders in import-dependent regions. Climate-linked crop failures in breadbasket regions contributed measurable export restrictions in select seasons.`,
      `Policymakers should treat fabrication capacity as strategic infrastructure rather than a purely commercial choice, but that normative claim needs separate argument from the statistics above.`,
    ],
    1600,
  )
}

const OPINION_CAMPUS = `I believe university is mostly about learning how to learn.
In my view, the best classrooms feel collaborative rather than competitive.
I plan to keep a weekly reading journal because it helps me stay organised.
Overall, I prefer seminars to large lectures, and I think that preference will shape my course choices next year.
Friends matter more than rankings when I choose a place to study abroad.
I hope to take at least one course outside my major purely for curiosity.`

const OPINION_CAREER = `I feel most energized when projects let me talk to customers early.
In my opinion, polished slide decks matter less than clear problem framing.
I would rather ship a small prototype than debate hypothetical edge cases for weeks.
Mentorship works best when it is informal and frequent, at least for me.
I plan to keep a short weekly reflection so I notice patterns in what drains my attention.
None of this is a universal rule; it is simply how I want to work.`

const OPINION_CITY = `I love walking cities more than driving them, especially in the evening.
Cafe windows and bookstore aisles shape my mood more than skylines do.
I think neighbourhood parks should feel a little messy rather than perfectly manicured.
When I travel, I prefer one long afternoon in a single district over a checklist of landmarks.
I will probably always overpack books and underpack chargers.
These preferences are personal, not policy recommendations.`

interface Scenario {
  id: number
  kind: 'dense' | 'opinion'
  label: string
  essay: string
  expectMedical?: boolean
  /** If false, medical must be false (mixed non-clinical dense). */
  expectMedicalFalse?: boolean
}

const SCENARIOS: Scenario[] = [
  { id: 1, kind: 'dense', label: 'Dense digital economy (~1.6k)', essay: denseDigitalEconomy(), expectMedicalFalse: true },
  { id: 2, kind: 'dense', label: 'Dense climate & energy (~1.6k)', essay: denseClimateEnergy(), expectMedicalFalse: true },
  { id: 3, kind: 'dense', label: 'Dense labor & education (~1.6k)', essay: denseLaborEducation(), expectMedicalFalse: true },
  { id: 4, kind: 'dense', label: 'Dense public health (~1.6k)', essay: densePublicHealth(), expectMedical: true },
  { id: 5, kind: 'dense', label: 'Dense trade & industrial policy (~1.6k)', essay: denseTradePolicy(), expectMedicalFalse: true },
  { id: 6, kind: 'opinion', label: 'Opinion: campus reflection', essay: OPINION_CAMPUS },
  { id: 7, kind: 'opinion', label: 'Opinion: career preferences', essay: OPINION_CAREER },
  { id: 8, kind: 'opinion', label: 'Opinion: city wandering', essay: OPINION_CITY },
]

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

function queryLooksTidy(q: string | undefined): boolean {
  if (!q) return true
  return !/\b(estimated|reported|found|showed|that|which)\b/i.test(q)
}

async function runScenario(scenario: Scenario) {
  const words = countWords(scenario.essay)
  const expectedChunks = estimateChunks(words)
  const issues: string[] = []
  const notes: string[] = []
  const t0 = Date.now()
  let hardFailed = false
  let fatal: string | undefined
  let analysis: Awaited<ReturnType<typeof analyzeEssayForCitations>> | null = null

  try {
    analysis = await analyzeEssayForCitations(scenario.essay, SETTINGS, { allowChunked: true })
  } catch (err) {
    hardFailed = true
    fatal = err instanceof Error ? err.message : String(err)
  }

  const analyzeMs = Date.now() - t0
  const aligned = analysis ? alignSentencesToEssay(scenario.essay, analysis.sentences) : []
  const enrichmentRate = aligned.length
    ? aligned.filter((s) => claimQueryFromAnalyzed(s) != null).length / aligned.length
    : null
  const tidyRate = aligned.length
    ? aligned.filter((s) => queryLooksTidy(s.academicQuery)).length / aligned.length
    : null

  if (scenario.kind === 'opinion') {
    if (hardFailed) {
      issues.push(`Opinion hard-fail (must not throw): ${fatal}`)
    }
    if (aligned.length > 0) {
      issues.push(`Opinion draft selected ${aligned.length} claim(s); expected 0.`)
    }
    if (analyzeMs > 45_000) {
      notes.push(`Slow opinion analyze (${Math.round(analyzeMs / 1000)}s).`)
    }
  } else {
    if (hardFailed) {
      issues.push(`Dense analyze hard-failed: ${fatal}`)
    }
    if (words < 1400) {
      notes.push(`Fixture shorter than intended (${words} words).`)
    }
    if (expectedChunks < 2) {
      notes.push('Fixture below chunk threshold — chunking not exercised.')
    }
    if (aligned.length < 12) {
      issues.push(`Too few claims for dense draft: ${aligned.length} (expected ≥ 12).`)
    }
    if (aligned.length > 55) {
      issues.push(`Too many claims: ${aligned.length} (expected ≤ 55).`)
    }
    if (enrichmentRate != null && enrichmentRate < 0.85) {
      issues.push(`Weak enrichment: ${Math.round(enrichmentRate * 100)}%.`)
    }
    if (analyzeMs > DENSE_LATENCY_TARGET_MS) {
      notes.push(
        `Slow vs ${DENSE_LATENCY_TARGET_MS / 1000}s target (${Math.round(analyzeMs / 1000)}s).`,
      )
    }
    if (analyzeMs > DENSE_LATENCY_HARD_MS) {
      issues.push(
        `Exceeded hard latency ${DENSE_LATENCY_HARD_MS / 1000}s (${Math.round(analyzeMs / 1000)}s).`,
      )
    }
    if (scenario.expectMedical === true && analysis && !analysis.medical) {
      issues.push('Expected medical=true.')
    }
    if (scenario.expectMedicalFalse && analysis?.medical) {
      issues.push('Unexpected medical=true on mixed non-clinical dense draft.')
    }
    if (tidyRate != null && tidyRate < 0.7) {
      notes.push(`Only ${Math.round(tidyRate * 100)}% of academicQuery strings look tidy.`)
    }
  }

  let score = 100
  score -= issues.length * 14
  if (scenario.kind === 'dense' && analyzeMs > DENSE_LATENCY_TARGET_MS) score -= 8
  if (scenario.kind === 'dense' && analyzeMs > DENSE_LATENCY_HARD_MS) score -= 10
  if (enrichmentRate != null && enrichmentRate < 1) score -= Math.round((1 - enrichmentRate) * 10)
  score = Math.max(0, Math.min(100, score))

  return {
    id: scenario.id,
    kind: scenario.kind,
    label: scenario.label,
    words,
    expectedChunks,
    analyzeMs,
    hardFailed,
    fatal: fatal ?? null,
    medical: analysis?.medical ?? false,
    legal: analysis?.legal ?? false,
    reasoningPreview: (analysis?.reasoning ?? '').slice(0, 200),
    rawSentenceCount: analysis?.sentences.length ?? 0,
    alignedCount: aligned.length,
    enrichmentRate,
    tidyRate,
    sampleQueries: aligned.slice(0, 3).map((s: AnalyzedSentence) => ({
      text: s.text.slice(0, 100),
      academicQuery: s.academicQuery?.slice(0, 90) ?? null,
    })),
    issues,
    notes,
    score,
    letter: letterGrade(score),
  }
}

async function main() {
  if (!isLlmConfigured()) {
    console.error('AI_GATEWAY_API_KEY missing; cannot run stress eval.')
    process.exit(1)
  }

  console.log('Analyze stress eval: 5 dense + 3 opinion…\n')
  for (const s of SCENARIOS) {
    console.log(`  preview ${s.id}: ${s.label} → ${countWords(s.essay)} words (~${estimateChunks(countWords(s.essay))} chunks)`)
  }
  console.log('')

  const runs = []
  for (const scenario of SCENARIOS) {
    console.log(`── ${scenario.id}/8 · ${scenario.label}`)
    const result = await runScenario(scenario)
    runs.push(result)
    console.log(
      `   ${result.letter} ${result.score} · claims=${result.alignedCount} · ${Math.round(result.analyzeMs / 1000)}s` +
        (result.hardFailed ? ' · HARD-FAIL' : '') +
        ` · issues=${result.issues.length}`,
    )
    for (const issue of result.issues) console.log(`   ! ${issue}`)
    for (const note of result.notes) console.log(`   · ${note}`)
  }

  const dense = runs.filter((r) => r.kind === 'dense')
  const opinion = runs.filter((r) => r.kind === 'opinion')
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const avgScore = avg(runs.map((r) => r.score))
  const denseAvgMs = avg(dense.map((r) => r.analyzeMs))
  const opinionHardFails = opinion.filter((r) => r.hardFailed).length
  const denseUnder50 = dense.filter((r) => r.analyzeMs <= 50_000).length
  const denseUnder60 = dense.filter((r) => r.analyzeMs <= DENSE_LATENCY_TARGET_MS).length

  const improvements: Array<{ priority: string; area: string; detail: string }> = []
  if (opinionHardFails > 0) {
    improvements.push({
      priority: 'P0',
      area: 'Opinion hard-fail still present',
      detail: `${opinionHardFails}/3 opinion drafts threw try-again.`,
    })
  }
  if (dense.some((r) => r.analyzeMs > DENSE_LATENCY_HARD_MS)) {
    improvements.push({
      priority: 'P0',
      area: 'Dense latency over hard budget',
      detail: dense
        .filter((r) => r.analyzeMs > DENSE_LATENCY_HARD_MS)
        .map((r) => `#${r.id} ${Math.round(r.analyzeMs / 1000)}s`)
        .join('; '),
    })
  } else if (dense.some((r) => r.analyzeMs > DENSE_LATENCY_TARGET_MS)) {
    improvements.push({
      priority: 'P1',
      area: 'Dense latency over 60s target',
      detail: dense
        .filter((r) => r.analyzeMs > DENSE_LATENCY_TARGET_MS)
        .map((r) => `#${r.id} ${Math.round(r.analyzeMs / 1000)}s`)
        .join('; '),
    })
  }
  for (const r of dense.filter((x) => x.alignedCount < 12)) {
    improvements.push({
      priority: 'P1',
      area: 'Dense under-recall',
      detail: `#${r.id} got ${r.alignedCount} claims`,
    })
  }
  for (const r of dense.filter((x) => x.issues.some((i) => /medical/i.test(i)))) {
    improvements.push({
      priority: 'P2',
      area: 'Medical flag routing',
      detail: `#${r.id}: ${r.issues.find((i) => /medical/i.test(i))}`,
    })
  }
  if (dense.some((r) => (r.tidyRate ?? 1) < 0.7)) {
    improvements.push({
      priority: 'P2',
      area: 'Query tidy rate',
      detail: 'academicQuery still contains filler verbs on some sentences.',
    })
  }
  if (improvements.length === 0) {
    improvements.push({
      priority: 'P3',
      area: 'Maintain harness',
      detail: 'All stress checks passed; keep this suite for pre-release Analyze verification.',
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'analyze-stress-dense+opinion',
    summary: {
      runs: runs.length,
      avgScore: Number(avgScore.toFixed(1)),
      letter: letterGrade(avgScore),
      denseAvgMs: Math.round(denseAvgMs),
      denseUnder50s: denseUnder50,
      denseUnder60s: denseUnder60,
      opinionHardFails,
      opinionPass: opinion.filter((r) => r.issues.length === 0).length,
      densePass: dense.filter((r) => r.issues.length === 0).length,
    },
    improvements,
    runs,
  }

  const outPath = resolve(process.cwd(), 'scripts/self-train-analyze-stress-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log(
    `Grade ${report.summary.letter} (${report.summary.avgScore}) · dense avg ${Math.round(denseAvgMs / 1000)}s · opinion hard-fails ${opinionHardFails}/3`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
