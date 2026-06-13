import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { complete, isLlmConfigured } from '@/lib/ai/provider'
import { BLUEPRINT_ANALYZE_SYSTEM } from '@/lib/ai/prompts'
import { blueprintAnalyzeResponseSchema } from '@/lib/ai/digest/schemas'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import {
  applyWeightsToWordTotal,
  applyWordBudgetTemplate,
} from '@/constants/blueprintSettings'
import {
  getAttachmentText,
  mockAnalyzeInstructions,
  mockProposeFromAnalysis,
  syncBlueprintResolvedFields,
} from '@/state/essayInitial'
import type { EssayBlueprint, WordBudgetSection } from '@/types'

const bodySchema = z.object({
  blueprint: z.record(z.unknown()),
})

function buildWordBudgetFromProposals(
  blueprint: EssayBlueprint,
  sections?: { label: string; targetWords: number }[],
): EssayBlueprint['wordBudget'] {
  const total = blueprint.wordLimit.maxAuto
    ? syncBlueprintResolvedFields(blueprint).wordLimit.max
    : blueprint.wordLimit.max

  if (sections && sections.length > 0) {
    const mapped: WordBudgetSection[] = sections.map((s, i) => ({
      id: `sec-ai-${i}`,
      label: s.label,
      weightPercent: total > 0 ? Math.round((s.targetWords / total) * 100) : 0,
      targetWords: s.targetWords,
    }))
    return { total, sections: applyWeightsToWordTotal(mapped, total) }
  }

  const docType =
    blueprint.quickSettings.documentTypeIsAuto ||
    blueprint.quickSettings.documentType === 'Auto'
      ? blueprint.documentType
      : blueprint.quickSettings.documentType

  return applyWordBudgetTemplate(docType, total)
}

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'analyze')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const blueprint = parsed.data.blueprint as unknown as EssayBlueprint
  const synced = syncBlueprintResolvedFields(blueprint, auth.tier)
  const briefText = synced.instructionsText.trim()
  const rubricText = getAttachmentText(synced)

  if (!isLlmConfigured()) {
    const analysis = mockAnalyzeInstructions(synced)
    const proposals = mockProposeFromAnalysis(synced, analysis)
    return NextResponse.json({
      analysis,
      proposals: { ...proposals, wordBudget: buildWordBudgetFromProposals(synced), frameworkGenerated: true },
    })
  }

  try {
    const text = await complete(
      [
        {
          role: 'user',
          content: [
            `Assignment brief:\n${briefText || '(none)'}`,
            rubricText ? `\nRubric:\n${rubricText}` : '',
            `\nDocument type setting: ${synced.quickSettings.documentType}`,
            `\nResolved document type: ${synced.documentType}`,
            `\nWriting style: ${synced.writingStyle}`,
            `\nReading level: ${synced.readingLevel}`,
            `\nReferencing: ${synced.referencingStyleId}`,
            `\nWord limit: ${synced.wordLimit.min}–${synced.wordLimit.max} words`,
            `\nQuick settings: ${JSON.stringify(synced.quickSettings)}`,
          ].join(''),
        },
      ],
      { system: BLUEPRINT_ANALYZE_SYSTEM, temperature: 0.3 },
    )

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsedJson = blueprintAnalyzeResponseSchema.parse(JSON.parse(jsonMatch[0]))
      const proposals = parsedJson.proposals ?? {}
      const nextBlueprint: EssayBlueprint = {
        ...synced,
        title: proposals.title ?? synced.title,
        thesis: proposals.thesis ?? synced.thesis,
        researchQuestion: proposals.researchQuestion ?? synced.researchQuestion,
        documentType: proposals.documentType ?? synced.documentType,
      }
      const wordBudget = buildWordBudgetFromProposals(nextBlueprint, proposals.wordBudgetSections)

      return NextResponse.json({
        analysis: parsedJson.analysis,
        proposals: {
          title: nextBlueprint.title,
          thesis: nextBlueprint.thesis,
          researchQuestion: nextBlueprint.researchQuestion,
          documentType: nextBlueprint.documentType,
          wordBudget,
          frameworkGenerated: true,
        },
      })
    }
  } catch {
    /* fallback */
  }

  const analysis = mockAnalyzeInstructions(synced)
  const proposals = mockProposeFromAnalysis(synced, analysis)
  return NextResponse.json({
    analysis,
    proposals: { ...proposals, wordBudget: buildWordBudgetFromProposals(synced), frameworkGenerated: true },
  })
}
