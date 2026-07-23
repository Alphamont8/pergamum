/**
 * Full-pipeline smoke: ~1k-word fact-dense draft → Analyze (chunked) → Cite (capped).
 *
 * Usage: npx tsx --env-file=.env.local scripts/self-train-1k-e2e.mts
 */
import { analyzeEssayForCitations, claimQueryFromAnalyzed } from '../lib/cite/analyze'
import { findCitationForSentence } from '../lib/cite/pipeline'
import { createCitationSearchCache } from '../lib/cite/searchCache'
import { alignSentencesToEssay } from '../lib/essay/alignSentences'
import { generateEssayTitle } from '../lib/essay/title'
import { countWords, entitlementsForPlan } from '../lib/billing/entitlements'
import { isLlmConfigured } from '../lib/ai/provider'
import type { GenerationSettings } from '../types'

const SETTINGS: GenerationSettings = {
  styleId: 'apa',
  inText: true,
  suggestCorrections: false,
  recency: '5y',
  sourceTier: 'any',
}

const MAX_CITE = 4

const FACT_BANK = [
  `Global smartphone shipments reached 1.24 billion units in 2024 according to industry trackers, recovering from three consecutive years of contraction.`,
  `Statista reports that Apple held roughly 18% of worldwide unit share in Q4 2024 while Samsung remained near 19%.`,
  `Pew Research Center surveys from 2023 found that 97% of US adults under 30 own a smartphone, compared with 76% of adults aged 65 and older.`,
  `Mobile advertising spend crossed $180 billion globally in 2024, with retail and consumer electronics accounting for nearly one-third of that total.`,
  `IEA data showed global renewable electricity capacity additions of about 510 GW in 2023, the highest annual figure on record.`,
  `IEA Global EV Outlook figures show electric vehicle sales surpassed 14 million units worldwide in 2023, about 18% of new car sales.`,
  `WHO estimates place hypertension prevalence among adults aged 30–79 at around 33% globally.`,
  `Gartner estimated worldwide information-security spending near $215 billion in 2024.`,
  `UNCTAD estimated that business-to-consumer online sales represented 19% of total retail trade in developed economies in 2022.`,
  `OECD PISA 2022 results showed average mathematics scores declining across many member countries relative to 2018 baselines.`,
  `Remittances to low- and middle-income countries exceeded $650 billion in a recent World Bank tracking year.`,
  `The CHIPS and Science Act allocated tens of billions of dollars in incentives for domestic chip fabrication in the United States.`,
  `Office vacancy rates in several major US CBDs remained above 15% in 2024 according to commercial brokerage reports.`,
  `LinkedIn workforce reports indicated that AI-related job postings in the US grew more than 30% year over year into 2024.`,
  `Battery pack prices fell toward $139 per kWh on a volume-weighted average basis in recent reporting years.`,
  `Coal generation still supplied about 35% of world electricity in 2023 despite record clean-energy buildout.`,
]

function buildDenseEssay(targetWords: number): string {
  const paras: string[] = []
  let i = 0
  while (countWords(paras.join('\n\n')) < targetWords - 40) {
    const a = FACT_BANK[i % FACT_BANK.length]!
    const b = FACT_BANK[(i + 1) % FACT_BANK.length]!
    paras.push(`${a} ${b}`)
    i += 2
    if (i > FACT_BANK.length * 6) break
  }
  paras.push(
    'I believe open data standards would make these sources easier to compare, but that is a normative preference rather than a statistical claim.',
  )
  while (countWords(paras.join('\n\n')) > targetWords + 80 && paras.length > 3) {
    paras.splice(paras.length - 2, 1)
  }
  return paras.join('\n\n')
}

async function main() {
  if (!isLlmConfigured()) {
    console.error('AI_GATEWAY_API_KEY missing.')
    process.exit(1)
  }

  const essay = buildDenseEssay(1000)
  const words = countWords(essay)
  const entitlements = entitlementsForPlan('pro')
  const issues: string[] = []
  const notes: string[] = []

  console.log(`1k E2E smoke: ${words} words · Analyze (chunked) → Cite ×${MAX_CITE}\n`)

  const t0 = Date.now()
  const analysis = await analyzeEssayForCitations(essay, SETTINGS, { allowChunked: true })
  const aligned = alignSentencesToEssay(essay, analysis.sentences)
  const title = await generateEssayTitle(essay)
  const analyzeMs = Date.now() - t0

  console.log(
    `Analyze: ${aligned.length} claims · ${Math.round(analyzeMs / 1000)}s · title="${title}" · medical=${analysis.medical}`,
  )

  if (aligned.length < 8) issues.push(`Too few claims after analyze: ${aligned.length}`)
  if (!title.trim() || title === 'Untitled draft') issues.push('Title generation returned placeholder.')
  if (aligned.length !== analysis.sentences.length) {
    notes.push(`Alignment dropped ${analysis.sentences.length - aligned.length} sentences.`)
  }

  const enrichmentRate = aligned.length
    ? aligned.filter((s) => claimQueryFromAnalyzed(s) != null).length / aligned.length
    : 0
  if (enrichmentRate < 0.8) {
    issues.push(`Weak enrichment: ${Math.round(enrichmentRate * 100)}%.`)
  } else {
    notes.push(`Enrichment ${Math.round(enrichmentRate * 100)}%.`)
  }

  const citeTargets = aligned.slice(0, MAX_CITE)
  const searchCache = createCitationSearchCache()
  const shared: { id: string }[] = []
  let citeDone = 0
  let citeFailed = 0
  const citeMsStart = Date.now()

  for (const s of citeTargets) {
    const c0 = Date.now()
    try {
      const result = await findCitationForSentence({
        sentence: s.text,
        settings: {
          ...SETTINGS,
          medical: analysis.medical,
          legal: analysis.legal,
        },
        entitlements,
        priorSourceIds: shared.map((x) => x.id),
        allSourcesSoFar: [] as never[],
        claimType: s.claimType,
        claimQuery: claimQueryFromAnalyzed(s),
        analyzedSentence: s,
        searchCache,
      })
      const ms = Date.now() - c0
      if (result.status === 'done' && result.record?.id) {
        shared.push({ id: result.record.id })
        citeDone += 1
        console.log(`  ✓ Cite ${s.index + 1}: ${result.record.title?.slice(0, 80) ?? '(untitled)'} (${ms}ms)`)
      } else {
        citeFailed += 1
        const reason = result.errorMessage || result.status
        notes.push(`Miss Sentence ${s.index + 1}: ${reason}`)
        console.log(`  ✗ Cite ${s.index + 1}: ${reason} (${ms}ms)`)
      }
    } catch (err) {
      citeFailed += 1
      const msg = err instanceof Error ? err.message : String(err)
      issues.push(`Cite crash on Sentence ${s.index + 1}: ${msg}`)
      console.log(`  ✗ Cite ${s.index + 1}: crash — ${msg}`)
    }
  }

  const citeMs = Date.now() - citeMsStart
  const totalMs = Date.now() - t0

  if (citeDone === 0 && citeTargets.length > 0) {
    issues.push('No citations completed for any analyzed claim.')
  }

  console.log(
    `\nCite: ${citeDone}/${citeTargets.length} done · ${citeFailed} miss · ${Math.round(citeMs / 1000)}s`,
  )
  console.log(`Total wall: ${Math.round(totalMs / 1000)}s`)
  for (const n of notes) console.log(`  · ${n}`)
  for (const i of issues) console.log(`  ! ${i}`)

  if (issues.length) {
    console.error('\nFAIL')
    process.exit(1)
  }
  console.log('\nPASS')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
