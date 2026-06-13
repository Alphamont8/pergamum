import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { complete, isLlmConfigured } from '@/lib/ai/provider'
import { OUTLINE_GENERATE_SYSTEM } from '@/lib/ai/prompts'
import { outlineGenerateResponseSchema } from '@/lib/ai/digest/schemas'
import { normalizeOutlineNodes } from '@/lib/ai/digest/parsers'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import {
  createInitialOutlineNodes,
  mockOutlineFromBlueprint,
} from '@/state/essayInitial'
import type { EssayBlueprint } from '@/types'

const bodySchema = z.object({
  blueprint: z.record(z.unknown()),
})

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'outline')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const blueprint = parsed.data.blueprint as unknown as EssayBlueprint

  if (!isLlmConfigured()) {
    const fallback =
      blueprint.wordBudget.sections.length > 0
        ? mockOutlineFromBlueprint(blueprint)
        : createInitialOutlineNodes()
    return NextResponse.json({ nodes: fallback })
  }

  try {
    const text = await complete(
      [
        {
          role: 'user',
          content: [
            `Title: ${blueprint.title}`,
            `Thesis: ${blueprint.thesis}`,
            `Research question: ${blueprint.researchQuestion}`,
            `Document type: ${blueprint.documentType}`,
            `Writing style: ${blueprint.writingStyle}`,
            `Reading level: ${blueprint.readingLevel}`,
            `\nSections and word targets:`,
            ...blueprint.wordBudget.sections.map(
              (s) => `- ${s.label}: ${s.targetWords} words`,
            ),
            blueprint.analysis
              ? `\nSuggested structure: ${blueprint.analysis.suggestedStructure.join(', ')}`
              : '',
          ].join('\n'),
        },
      ],
      { system: OUTLINE_GENERATE_SYSTEM, temperature: 0.4 },
    )

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsedJson = outlineGenerateResponseSchema.parse(JSON.parse(jsonMatch[0]))
      if (parsedJson.nodes.length > 0) {
        const nodes = normalizeOutlineNodes(parsedJson.nodes)
        const hasHierarchy = nodes.some((n) => n.parentId != null)
        if (hasHierarchy) {
          return NextResponse.json({ nodes })
        }
      }
    }
  } catch {
    /* fallback */
  }

  const fallback =
    blueprint.wordBudget.sections.length > 0
      ? mockOutlineFromBlueprint(blueprint)
      : createInitialOutlineNodes()

  return NextResponse.json({ nodes: fallback })
}
