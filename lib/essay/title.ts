import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { complete, completeStructured } from '@/lib/ai/provider'
import { ESSAY_TITLE_PLAIN_SYSTEM, ESSAY_TITLE_STRUCTURED_SYSTEM } from '@/lib/ai/prompts'

const titleSchema = z.object({
  title: z.string().min(3).max(80),
})

function cleanTitle(raw: string): string {
  let title = raw
    .replace(/^[\s"'“”`]+|[\s"'“”`.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length > 72) {
    title = title.slice(0, 72).replace(/\s+\S*$/, '').trim()
  }
  return title
}

function looksLikeTitle(value: string): boolean {
  if (value.length < 3 || value.length > 80) return false
  if (/^(we need|write a|here is|title:|the title|output|json|essay|possible)/i.test(value)) {
    return false
  }
  if (/\b(in|of|the|a|an|and|for|to)$/i.test(value)) return false
  const words = value.split(/\s+/).filter(Boolean)
  return words.length >= 2 && words.length <= 12
}

function extractTitle(raw: string): string | null {
  if (!raw) return null

  const jsonMatch = raw.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/i)
  if (jsonMatch?.[1]) {
    const fromJson = cleanTitle(jsonMatch[1].replace(/\\"/g, '"'))
    if (looksLikeTitle(fromJson)) return fromJson
  }

  const titled = [...raw.matchAll(/(?:^|\n)\s*TITLE\s*:\s*(.+)\s*$/gim)].map((m) =>
    cleanTitle(m[1]),
  )
  for (const line of titled.reverse()) {
    if (looksLikeTitle(line)) return line
  }

  const labeled = raw.match(
    /(?:possible title|suitable title|title)\s*[:-]\s*["“]?([^"”\n]+)["”]?/i,
  )
  if (labeled?.[1]) {
    const fromLabel = cleanTitle(labeled[1])
    if (looksLikeTitle(fromLabel)) return fromLabel
  }

  const quotes = [...raw.matchAll(/["“]([^"”\n]{8,80})["”]/g)].map((m) => cleanTitle(m[1]))
  for (const quote of quotes.reverse()) {
    if (looksLikeTitle(quote)) return quote
  }

  return null
}

function fallbackTitle(essay: string): string {
  const first = essay.trim().split(/\n+/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (!first) return 'Untitled draft'
  return first.length > 72 ? `${first.slice(0, 72).trim()}…` : first
}

export function needsGeneratedTitle(title: string | null | undefined): boolean {
  const t = title?.trim()
  return !t || t === 'Untitled draft' || t === 'Untitled'
}

/** Generate and persist a draft title when the row still has a placeholder. */
export async function ensureGenerationTitle(
  service: SupabaseClient,
  generationId: string,
  essay: string,
  existingTitle?: string | null,
): Promise<string> {
  if (!needsGeneratedTitle(existingTitle)) {
    return existingTitle!.trim()
  }
  const title = await generateEssayTitle(essay)
  await service.from('generations').update({ title }).eq('id', generationId)
  return title
}

/** Generate a short history title for an essay via DeepSeek. */
export async function generateEssayTitle(essay: string): Promise<string> {
  const excerpt = essay.trim().slice(0, 1600)
  if (!excerpt) return 'Untitled draft'

  const messages = [
    {
      role: 'user' as const,
      content: `Essay:
"""
${excerpt}
"""`,
    },
  ]

  try {
    const { title } = await completeStructured(titleSchema, messages, {
      system: ESSAY_TITLE_STRUCTURED_SYSTEM,
      temperature: 0.1,
      maxTokens: 64,
    })
    const cleaned = cleanTitle(title)
    if (looksLikeTitle(cleaned)) return cleaned
  } catch {
    /* try plain completion */
  }

  try {
    const raw = await complete(messages, {
      system: ESSAY_TITLE_PLAIN_SYSTEM,
      temperature: 0.1,
      maxTokens: 40,
    })
    const extracted = extractTitle(raw) || cleanTitle(raw.split('\n').pop() ?? raw)
    if (extracted && looksLikeTitle(extracted)) return extracted
  } catch {
    /* fall through */
  }

  return fallbackTitle(essay)
}
