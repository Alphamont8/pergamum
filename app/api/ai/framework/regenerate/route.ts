import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getApiAuth } from '@/lib/auth/context'
import { complete, isLlmConfigured } from '@/lib/ai/provider'
import { QuotaExceededError, assertWithinQuota, quotaErrorResponse } from '@/lib/ai/usage'
import { buildBlueprintContext } from '@/lib/draft-utils'
import type { EssayBlueprint } from '@/types'

const bodySchema = z.object({
  field: z.enum(['title', 'researchQuestion', 'thesis']),
  blueprint: z.record(z.unknown()),
})

const FIELD_PROMPTS: Record<string, string> = {
  title: 'Generate a concise, academic essay title. Return only the title text, no quotes or labels.',
  researchQuestion:
    'Generate a clear, focused research question for this essay. Return only the question text.',
  thesis:
    'Generate a strong thesis statement or central argument for this essay. Return only the thesis text (1-3 sentences).',
}

export async function POST(request: Request) {
  const auth = await getApiAuth()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await assertWithinQuota(auth, 'framework')
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json(quotaErrorResponse(err), { status: 429 })
    }
    throw err
  }

  const { field, blueprint } = parsed.data
  const bp = blueprint as unknown as EssayBlueprint

  if (!isLlmConfigured()) {
    const fallbacks: Record<string, string> = {
      title: bp.title || 'Essay Title',
      researchQuestion: bp.researchQuestion || 'What is the central question this essay addresses?',
      thesis: bp.thesis || 'This essay argues that the topic requires careful analysis.',
    }
    return NextResponse.json({ value: fallbacks[field] })
  }

  try {
    const text = await complete(
      [
        {
          role: 'user',
          content: [
            buildBlueprintContext(bp),
            bp.instructionsRaw ? `\nInstructions:\n${bp.instructionsRaw.slice(0, 4000)}` : '',
            `\nRegenerate the ${field} for this essay.`,
          ].join('\n'),
        },
      ],
      { system: FIELD_PROMPTS[field], temperature: 0.4, maxTokens: 512 },
    )
    return NextResponse.json({ value: text.trim().replace(/^["']|["']$/g, '') })
  } catch {
    const fallbacks: Record<string, string> = {
      title: bp.title || 'Essay Title',
      researchQuestion: bp.researchQuestion || 'What is the central question this essay addresses?',
      thesis: bp.thesis || 'This essay argues that the topic requires careful analysis.',
    }
    return NextResponse.json({ value: fallbacks[field] })
  }
}
