import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { complete } from '@/lib/ai/provider'
import { DRAFT_SYSTEM } from '@/lib/ai/prompts'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import { buildBlueprintContext, getSectionOutlineContext } from '@/lib/draft-utils'
import { contentToHtml } from '@/state/essayInitial'
import { generateDraftSection as stubGenerate } from '@/services/essay/stubs'
import type { EssayBlueprint, OutlineNode, SourceRecord } from '@/types'

const bodySchema = z.object({
  sectionId: z.string(),
  sectionLabel: z.string(),
  blueprint: z.record(z.unknown()),
  outline: z.object({ nodes: z.array(z.record(z.unknown())) }).optional(),
  sources: z.array(z.record(z.unknown())).optional(),
  fullDraft: z.boolean().optional(),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'draft')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const { sectionId, sectionLabel, blueprint, outline, sources } = parsed.data
  const bp = blueprint as unknown as EssayBlueprint
  const nodes = (outline?.nodes ?? []) as unknown as OutlineNode[]
  const sourceRecords = (sources ?? []) as unknown as SourceRecord[]
  const budgetSection = bp.wordBudget.sections.find((s) => s.id === sectionId)
  const targetWords = budgetSection?.targetWords ?? 400
  const outlineContext = getSectionOutlineContext(sectionId, nodes, sourceRecords)

  const userPrompt = [
    buildBlueprintContext(bp),
    `\nSection: "${sectionLabel}"`,
    `Target words: ${targetWords}`,
    `\nOutline for this section:\n${outlineContext}`,
    '\nWrite this section as HTML integrating the outline points and source quotes with proper citations.',
    'When citing a source from the outline, use the token [cite:SOURCE_ID] where SOURCE_ID matches the source id from the outline context.',
    `Citation style: ${bp.referencingStyleId ?? bp.citationStyle}`,
  ].join('\n')

  try {
    const content = await complete(
      [{ role: 'user', content: userPrompt }],
      { system: DRAFT_SYSTEM, maxTokens: 2048 },
    )
    const trimmed = content.trim()
    const html = trimmed.startsWith('<') ? trimmed : contentToHtml(trimmed)
    return NextResponse.json({
      content: trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html,
    })
  } catch {
    const content = await stubGenerate(sectionLabel, bp)
    return NextResponse.json({ content, html: contentToHtml(content) })
  }
}
