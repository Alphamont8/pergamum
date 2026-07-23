/**
 * Scaling stress: one fact-dense run at each of 1k / 1.5k / 2k / 3k / 5k words.
 * Verifies chunking keeps Analyze latency from scaling linearly with length.
 *
 * Usage: npx tsx --env-file=.env.local scripts/self-train-analyze-scale.mts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyzeEssayForCitations, claimQueryFromAnalyzed, estimateMinimumCitableSentences } from '../lib/cite/analyze'
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

const WORD_TARGETS = [1000, 1500, 2000, 3000, 5000] as const
const RUNS_PER_SIZE = 1
const CHUNK_WORDS = 650
const CHUNK_THRESHOLD = 900

/** Soft latency budgets by size — chunking should keep these roughly flat above ~2k. */
function latencyTargetMs(words: number): number {
  if (words <= 1100) return 55_000
  if (words <= 1600) return 70_000
  if (words <= 2100) return 85_000
  if (words <= 3200) return 100_000
  return 120_000
}

function latencyHardMs(words: number): number {
  return Math.round(latencyTargetMs(words) * 1.75)
}

function estimateChunks(words: number): number {
  if (words <= CHUNK_THRESHOLD) return 1
  return Math.max(2, Math.ceil(words / CHUNK_WORDS))
}

/** Unique fact paragraphs — no repeated filler templates. */
const FACT_BANK: string[] = [
  `Global smartphone shipments reached 1.24 billion units in 2024 according to industry trackers, recovering from three consecutive years of contraction.`,
  `Statista reports that Apple held roughly 18% of worldwide unit share in Q4 2024 while Samsung remained near 19%.`,
  `Average selling prices rose to about $410 per device in premium segments, even as entry-level Android ASPs stayed below $180 in emerging markets.`,
  `Pew Research Center surveys from 2023 found that 97% of US adults under 30 own a smartphone, compared with 76% of adults aged 65 and older.`,
  `Mobile advertising spend crossed $180 billion globally in 2024, with retail and consumer electronics accounting for nearly one-third of that total.`,
  `Data.ai estimated that consumers spent $171 billion in app stores during 2023, up 3% year over year.`,
  `UNCTAD estimated that business-to-consumer online sales represented 19% of total retail trade in developed economies in 2022.`,
  `Google–Temasek–Bain e-Conomy reports put Southeast Asia's digital economy at $263 billion in GMV for 2024, with e-commerce contributing more than half.`,
  `Indonesia alone accounted for roughly $82 billion of that regional GMV in 2024.`,
  `McKinsey analysis has suggested that parcel volumes in major cities may grow 8–10% annually through 2030 if omnichannel retail continues on its current path.`,
  `Same-day delivery share reached 12% of online orders in top-tier US metros in 2024, versus under 4% in mid-sized markets.`,
  `Hyperscaler cloud infrastructure spending exceeded $80 billion in a single quarter among the largest providers in 2024.`,
  `Enterprise surveys report that more than 60% of large firms now run at least one production workload on public cloud.`,
  `Latency-sensitive workloads still keep an estimated 35–40% of compute on private data centers in regulated industries.`,
  `Gartner estimated worldwide information-security spending near $215 billion in 2024.`,
  `IEA data showed global renewable electricity capacity additions of about 510 GW in 2023, the highest annual figure on record.`,
  `Solar photovoltaic alone contributed roughly three-quarters of that incremental renewable capacity in 2023.`,
  `Coal generation still supplied about 35% of world electricity in 2023 despite record clean-energy buildout.`,
  `CDP reported that over 23,000 companies disclosed environmental data through its platform in 2023.`,
  `Science Based Targets initiative counted more than 4,000 companies with validated near-term targets by mid-2024.`,
  `Scope 3 emissions often represent 70–90% of a consumer brand's carbon footprint in life-cycle assessments.`,
  `WMO assessments placed 2023 global mean surface temperature about 1.45°C above the 1850–1900 baseline.`,
  `Arctic sea ice extent minima have declined by roughly 12% per decade since satellite records began in 1979.`,
  `IEA Global EV Outlook figures show electric vehicle sales surpassed 14 million units worldwide in 2023, about 18% of new car sales.`,
  `Battery pack prices fell toward $139 per kWh on a volume-weighted average basis in recent reporting years.`,
  `The Global Methane Pledge aims for a 30% reduction in methane emissions from 2020 levels by 2030 among participating countries.`,
  `LinkedIn workforce reports indicated that AI-related job postings in the US grew more than 30% year over year into 2024.`,
  `Gallup's State of the Global Workplace estimated that only 23% of employees were engaged at work in 2023.`,
  `UNESCO estimated that more than 240 million children and youth were still out of school globally in recent reporting years.`,
  `OECD PISA 2022 results showed average mathematics scores declining across many member countries relative to 2018 baselines.`,
  `NAEP long-term trend assessments found that US 13-year-olds' reading scores fell several points compared with pre-pandemic assessments.`,
  `ILO modelled estimates place global youth unemployment near 13% in recent years, with large regional variation.`,
  `Remittances to low- and middle-income countries exceeded $650 billion in a recent World Bank tracking year.`,
  `Hybrid work surveys in high-income countries often find that 25–40% of knowledge employees work hybrid schedules.`,
  `Office vacancy rates in several major US CBDs remained above 15% in 2024 according to commercial brokerage reports.`,
  `WHO estimates place hypertension prevalence among adults aged 30–79 at around 33% globally.`,
  `The Global Burden of Disease study attributes millions of premature deaths annually to elevated systolic blood pressure.`,
  `UNICEF–WHO reporting showed measles first-dose vaccination coverage recovering toward 83% in 2022 after COVID-19 disruptions.`,
  `IDF Atlas estimates place adult diabetes prevalence above 10% in many high-income countries.`,
  `NHANES cycles show US adult obesity rates exceeding 40% in recent years.`,
  `GRAM project analyses estimate 1.27 million deaths annually directly attributable to antimicrobial-resistant infections.`,
  `WHO estimates that depression and anxiety rose by more than 25% in the first year of the COVID-19 pandemic.`,
  `Ambient PM2.5 exposure is linked to millions of premature deaths annually in Global Burden of Disease estimates.`,
  `The CHIPS and Science Act allocated tens of billions of dollars in incentives for domestic chip fabrication in the United States.`,
  `WTO estimates placed world merchandise trade volume growth at roughly 1–3% in recent years after the 2020 contraction.`,
  `Container freight rates on major East–West lanes fell more than 70% from 2021 peaks by late 2023 according to freight indices.`,
  `Nearshoring surveys report that 20–40% of multinational manufacturers relocated at least one production node closer to end markets.`,
  `IEA net-zero scenarios project critical mineral demand for batteries rising several-fold by 2030.`,
  `FAO food price indices swung by double-digit percentages across 2021–2023 amid fertilizer and climate shocks.`,
  `Eurostat figures often show that fewer than 15% of adults aged 25–64 in southern EU members participated in education or training in a four-week reference period.`,
  `Employer surveys report that roughly 40% of firms struggle to fill roles requiring advanced digital skills.`,
  `Zero-trust architecture adoption was cited by roughly one in three surveyed CISOs as a top priority for the next fiscal year.`,
  `Several European countries exceed 1 public EV charger per 10 electric vehicles, while others remain below 1 per 20.`,
  `Satellite-based leak detection campaigns have identified methane super-emitter events releasing tens of tonnes per hour at individual sites.`,
  `UNEP Adaptation Gap reports estimate developing-country adaptation needs in the hundreds of billions of dollars annually by 2030.`,
  `Informal employment still accounts for more than 50% of total employment in many lower-middle-income countries.`,
  `Commute times for hybrid workers fell by an estimated 30–60 minutes on remote days in selected metro studies.`,
  `Access to second-line antimicrobials remains uneven, with stewardship programmes cutting inappropriate prescribing by double-digit percentages in multi-site evaluations.`,
  `Household air pollution from solid fuels still affects hundreds of millions of people, primarily in low-income countries.`,
  `Cross-border e-commerce parcels numbered in the billions annually among major customs administrations.`,
  `Dual-use technology screening lengthened licensing cycles by weeks to months in firm surveys after AI-chip export controls.`,
  `Lithium, nickel, and cobalt supply concentration remains high, with the top three producers often accounting for more than half of refined output.`,
  `Recycling rates for EV batteries are still below 10% of end-of-life mass in most jurisdictions.`,
  `Services trade in digitally deliverable sectors grew faster than goods trade in multiple OECD datasets.`,
  `Climate-linked crop failures in breadbasket regions contributed to measurable export restrictions in select seasons.`,
  `Treatment gaps exceed 50% for common mental disorders in many countries according to cross-national surveys.`,
  `Hospital antibiotic stewardship programmes have reduced inappropriate prescribing by double-digit percentages in multi-site evaluations.`,
  `Clean cookstove programmes show mixed adherence and health outcomes across randomized and quasi-experimental trials.`,
  `VAT and de minimis threshold reforms in the EU altered landed costs for low-value cross-border shipments.`,
  `Apprenticeship starts in selected European economies recovered toward pre-pandemic volumes by 2023.`,
  `STEM degree completions continue to rise in absolute terms, yet gender gaps persist in computing and engineering across many OECD systems.`,
]

function buildDenseEssay(targetWords: number, runIndex: number): string {
  const start = (runIndex * 7) % FACT_BANK.length
  const paras: string[] = []
  let i = 0
  while (countWords(paras.join('\n\n')) < targetWords - 40) {
    const sentence = FACT_BANK[(start + i) % FACT_BANK.length]!
    // Pair sentences into paragraphs for realistic chunk boundaries.
    if (i % 2 === 0) {
      const next = FACT_BANK[(start + i + 1) % FACT_BANK.length]!
      paras.push(`${sentence} ${next}`)
      i += 2
    } else {
      paras.push(sentence)
      i += 1
    }
    if (i > FACT_BANK.length * 4) break
  }
  paras.push(
    'I believe open data standards would make these sources easier to compare, but that is a normative preference rather than a statistical claim.',
  )
  // Trim if overshot
  while (countWords(paras.join('\n\n')) > targetWords + 80 && paras.length > 4) {
    paras.splice(paras.length - 2, 1)
  }
  return paras.join('\n\n')
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
  return 'D'
}

async function runOne(targetWords: number, runIndex: number) {
  const essay = buildDenseEssay(targetWords, runIndex)
  const words = countWords(essay)
  const expectedChunks = estimateChunks(words)
  const targetMs = latencyTargetMs(words)
  const hardMs = latencyHardMs(words)
  const issues: string[] = []
  const notes: string[] = []
  const t0 = Date.now()
  let hardFailed = false
  let fatal: string | undefined
  let analysis: Awaited<ReturnType<typeof analyzeEssayForCitations>> | null = null

  try {
    analysis = await analyzeEssayForCitations(essay, SETTINGS, { allowChunked: true })
  } catch (err) {
    hardFailed = true
    fatal = err instanceof Error ? err.message : String(err)
  }

  const analyzeMs = Date.now() - t0
  const aligned = analysis ? alignSentencesToEssay(essay, analysis.sentences) : []
  const enrichmentRate = aligned.length
    ? aligned.filter((s) => claimQueryFromAnalyzed(s) != null).length / aligned.length
    : null

  // Expect most unique fact sentences — not a word-count proxy that fails on repeating fact banks.
  const minClaims = Math.max(8, Math.floor(estimateMinimumCitableSentences(essay) * 0.85))

  if (hardFailed) issues.push(`Hard-failed: ${fatal}`)
  if (aligned.length < minClaims) {
    issues.push(`Too few claims: ${aligned.length} (expected ≥ ${minClaims}).`)
  }
  if (enrichmentRate != null && enrichmentRate < 0.8) {
    issues.push(`Weak enrichment: ${Math.round(enrichmentRate * 100)}%.`)
  }
  if (analyzeMs > targetMs) {
    notes.push(`Over soft target ${Math.round(targetMs / 1000)}s (${Math.round(analyzeMs / 1000)}s).`)
  }
  if (analyzeMs > hardMs) {
    issues.push(`Over hard latency ${Math.round(hardMs / 1000)}s (${Math.round(analyzeMs / 1000)}s).`)
  }
  if (words > CHUNK_THRESHOLD && expectedChunks < 2) {
    notes.push('Expected chunking but estimate < 2.')
  }

  let score = 100
  score -= issues.length * 14
  if (analyzeMs > targetMs) score -= 6
  if (analyzeMs > hardMs) score -= 10
  score = Math.max(0, Math.min(100, score))

  return {
    targetWords,
    runIndex: runIndex + 1,
    words,
    expectedChunks,
    analyzeMs,
    hardFailed,
    fatal: fatal ?? null,
    alignedCount: aligned.length,
    enrichmentRate,
    medical: analysis?.medical ?? false,
    issues,
    notes,
    score,
    letter: letterGrade(score),
    msPer1kWords: Math.round((analyzeMs / Math.max(1, words)) * 1000),
  }
}

async function main() {
  if (!isLlmConfigured()) {
    console.error('AI_GATEWAY_API_KEY missing.')
    process.exit(1)
  }

  console.log(
    `Analyze scale stress: ${RUNS_PER_SIZE} runs × [${WORD_TARGETS.join(', ')}] words…\n`,
  )

  const runs = []
  for (const target of WORD_TARGETS) {
    for (let i = 0; i < RUNS_PER_SIZE; i++) {
      const label = `${target}w run ${i + 1}/${RUNS_PER_SIZE}`
      console.log(`── ${label}`)
      const result = await runOne(target, i)
      runs.push(result)
      console.log(
        `   ${result.letter} ${result.score} · ${result.words}w · ~${result.expectedChunks} chunks · claims=${result.alignedCount} · ${Math.round(result.analyzeMs / 1000)}s · ${result.msPer1kWords}ms/1k` +
          (result.hardFailed ? ' · HARD-FAIL' : ''),
      )
      for (const issue of result.issues) console.log(`   ! ${issue}`)
      for (const note of result.notes) console.log(`   · ${note}`)
    }
  }

  const bySize = WORD_TARGETS.map((target) => {
    const group = runs.filter((r) => r.targetWords === target)
    const avgMs = group.reduce((s, r) => s + r.analyzeMs, 0) / group.length
    const avgClaims = group.reduce((s, r) => s + r.alignedCount, 0) / group.length
    const avgScore = group.reduce((s, r) => s + r.score, 0) / group.length
    const pass = group.filter((r) => r.issues.length === 0).length
    const hardFails = group.filter((r) => r.hardFailed).length
    const avgMsPer1k = group.reduce((s, r) => s + r.msPer1kWords, 0) / group.length
    return {
      targetWords: target,
      runs: group.length,
      pass,
      hardFails,
      avgScore: Number(avgScore.toFixed(1)),
      avgMs: Math.round(avgMs),
      avgClaims: Number(avgClaims.toFixed(1)),
      avgMsPer1k: Math.round(avgMsPer1k),
      expectedChunks: estimateChunks(target),
      targetMs: latencyTargetMs(target),
    }
  })

  // Scaling check: 5k should not be ~5× slower than 1k on a per-word basis if chunking works.
  const oneK = bySize.find((s) => s.targetWords === 1000)!
  const fiveK = bySize.find((s) => s.targetWords === 5000)!
  const scalingRatio = fiveK.avgMs / Math.max(1, oneK.avgMs)
  const perWordRatio = fiveK.avgMsPer1k / Math.max(1, oneK.avgMsPer1k)

  const improvements: Array<{ priority: string; area: string; detail: string }> = []
  if (scalingRatio > 3) {
    improvements.push({
      priority: 'P0',
      area: 'Latency scales too steeply with length',
      detail: `5k avg ${Math.round(fiveK.avgMs / 1000)}s vs 1k ${Math.round(oneK.avgMs / 1000)}s (ratio ${scalingRatio.toFixed(2)}).`,
    })
  } else if (scalingRatio > 2.2) {
    improvements.push({
      priority: 'P1',
      area: 'Latency still rises with length',
      detail: `5k/1k wall-clock ratio ${scalingRatio.toFixed(2)}; per-1k-words ratio ${perWordRatio.toFixed(2)}.`,
    })
  }
  for (const s of bySize) {
    if (s.hardFails > 0) {
      improvements.push({
        priority: 'P0',
        area: `Hard-fails at ${s.targetWords}w`,
        detail: `${s.hardFails}/${s.runs} runs threw.`,
      })
    }
    if (s.pass < s.runs) {
      improvements.push({
        priority: 'P1',
        area: `Issues at ${s.targetWords}w`,
        detail: `${s.runs - s.pass}/${s.runs} runs had issues (avg ${Math.round(s.avgMs / 1000)}s, ${s.avgClaims} claims).`,
      })
    }
  }
  if (improvements.length === 0) {
    improvements.push({
      priority: 'P3',
      area: 'Scaling looks healthy',
      detail: `5k/1k wall ratio ${scalingRatio.toFixed(2)}; per-1k ratio ${perWordRatio.toFixed(2)}. Keep this harness.`,
    })
  }

  const avgScore = runs.reduce((s, r) => s + r.score, 0) / runs.length
  const report = {
    generatedAt: new Date().toISOString(),
    mode: 'analyze-scale-stress',
    summary: {
      totalRuns: runs.length,
      avgScore: Number(avgScore.toFixed(1)),
      letter: letterGrade(avgScore),
      scalingRatio5kTo1k: Number(scalingRatio.toFixed(2)),
      perWordRatio5kTo1k: Number(perWordRatio.toFixed(2)),
      bySize,
    },
    improvements,
    runs,
  }

  const outPath = resolve(process.cwd(), 'scripts/self-train-analyze-scale-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
  console.log(
    `Grade ${report.summary.letter} (${report.summary.avgScore}) · 5k/1k time ratio ${scalingRatio.toFixed(2)} · per-1k ratio ${perWordRatio.toFixed(2)}`,
  )
  for (const s of bySize) {
    console.log(
      `  ${s.targetWords}w: avg ${Math.round(s.avgMs / 1000)}s · ${s.avgClaims} claims · pass ${s.pass}/${s.runs} · ${s.avgMsPer1k}ms/1k · ~${s.expectedChunks} chunks`,
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
