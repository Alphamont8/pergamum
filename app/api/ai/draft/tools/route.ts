import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { complete } from '@/lib/ai/provider'
import { DRAFT_TOOL_PROMPTS } from '@/lib/ai/prompts'
import { parseDraftToolResponse } from '@/lib/ai/digest/parsers'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import { getDraftToolDef } from '@/lib/draft-tools'
import { buildBlueprintContext, buildDraftEssayText } from '@/lib/draft-utils'
import { runDraftToolStub } from '@/services/essay/stubs'
import type { DraftSection, DraftToolKind, EssayBlueprint } from '@/types'

const toolKinds = [
  'evidence',
  'goalAlignment',
  'spelling',
  'writingQuality',
  'shiftTone',
  'elevatePhrasing',
  'findSynonyms',
  'definePhrase',
] as const

const bodySchema = z.object({
  tool: z.enum(toolKinds),
  scope: z.enum(['section', 'essay']),
  sectionId: z.string().optional(),
  blueprint: z.record(z.unknown()),
  sections: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      content: z.string(),
    }),
  ),
  selectedText: z.string().optional(),
  targetWritingStyle: z.string().optional(),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'draft_tools')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const { tool, scope, sectionId, blueprint, sections, selectedText, targetWritingStyle } =
    parsed.data
  const bp = blueprint as unknown as EssayBlueprint
  const draftSections = sections as DraftSection[]
  const toolDef = getDraftToolDef(tool)
  const effectiveScope = toolDef.runMode === 'essay' ? 'essay' : scope
  const scopedSections =
    effectiveScope === 'section' && sectionId
      ? draftSections.filter((s) => s.id === sectionId)
      : draftSections

  const defaultSectionId = sectionId ?? draftSections[0]?.id ?? 'section-1'
  const sectionContents = new Map(scopedSections.map((s) => [s.id, s.content]))

  const draftText =
    effectiveScope === 'section' && sectionId
      ? scopedSections.map((s) => `## ${s.label}\n${s.content}`).join('\n\n')
      : buildDraftEssayText(draftSections)

  const userPrompt = [
    buildBlueprintContext(bp),
    bp.instructionsRaw ? `\nInstructions:\n${bp.instructionsRaw.slice(0, 3000)}` : '',
    bp.analysis?.goals?.length ? `\nGoals: ${bp.analysis.goals.join('; ')}` : '',
    bp.analysis?.rubricAlignment?.length
      ? `\nRubric:\n${bp.analysis.rubricAlignment.map((r) => `- ${r.criterion}: ${r.covered ? 'covered' : 'missing'}`).join('\n')}`
      : '',
    `\nWriting style: ${bp.writingStyle}`,
    `\nTone: ${bp.tone}`,
    `\nReading level: ${bp.readingLevel}`,
    `\nScope: ${effectiveScope}`,
    selectedText ? `\nSelected text: "${selectedText}"` : '',
    targetWritingStyle ? `\nTarget writing style: ${targetWritingStyle}` : '',
    `\nDraft text:\n${draftText}`,
    `\nSection IDs: ${scopedSections.map((s) => `${s.id} (${s.label})`).join(', ')}`,
  ].join('\n')

  try {
    const text = await complete(
      [{ role: 'user', content: userPrompt }],
      {
        system: DRAFT_TOOL_PROMPTS[tool] ?? DRAFT_TOOL_PROMPTS.writingQuality,
        maxTokens: 4096,
        temperature: toolDef.runMode === 'selection' ? 0.35 : 0.2,
      },
    )
    const suggestions = parseDraftToolResponse(
      text,
      tool as DraftToolKind,
      defaultSectionId,
      sectionContents,
    )
    return NextResponse.json({ suggestions })
  } catch {
    const suggestions = await runDraftToolStub(
      tool as DraftToolKind,
      draftSections,
      defaultSectionId,
      bp,
      selectedText,
      targetWritingStyle,
    )
    return NextResponse.json({ suggestions })
  }
}
