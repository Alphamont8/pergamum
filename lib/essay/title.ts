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
  // Reject truncated sentence openings.
  if (
    /^(lighting|hypertension|strict|working|in|when|after|during|social|climate)\s+\w+\s+(forms|remains|requires|predicts|proposes|can|will|has|have|is|are|show|shows)\b/i.test(
      value,
    )
  ) {
    return false
  }
  // Reject titles that still read like claim verbs rather than noun phrases.
  if (/\b(Show|Shows|Requires|Predicts|Obtained|Remains|Forms|Propose|Proposes)\b/.test(value)) {
    return false
  }
  const words = value.split(/\s+/).filter(Boolean)
  if (words.length < 2 || words.length > 10) return false
  // Prefer Title Case-ish output (at least half the words capitalized).
  const capped = words.filter((w) => /^[A-Z]/.test(w)).length
  if (capped < Math.ceil(words.length * 0.5)) return false
  return true
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
  const { error } = await service.from('generations').update({ title }).eq('id', generationId)
  if (error) {
    return existingTitle?.trim() || title
  }
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
      temperature: 0.15,
      maxTokens: 40,
    })
    const extracted = extractTitle(raw) || cleanTitle(raw.split('\n')[0] ?? raw)
    if (extracted && looksLikeTitle(extracted)) return extracted
  } catch {
    /* fall through */
  }

  // Third pass: force a terse noun-phrase answer.
  try {
    const raw = await complete(
      [
        {
          role: 'user',
          content: `Write a 3-6 word Title Case noun-phrase title for this essay (not a full sentence). Reply with the title only.\n\n${excerpt.slice(0, 600)}`,
        },
      ],
      { temperature: 0.2, maxTokens: 24 },
    )
    const cleaned = cleanTitle(raw.split('\n')[0] ?? raw)
    if (looksLikeTitle(cleaned)) return cleaned
  } catch {
    /* fall through */
  }

  return heuristicTitle(excerpt)
}

/** Fast local title when LLM title generation would compete with analyze time budget. */
export function heuristicEssayTitle(essay: string): string {
  return heuristicTitle(essay)
}

function heuristicTitle(essay: string): string {
  const stop = new Set([
    'the',
    'a',
    'an',
    'and',
    'or',
    'of',
    'in',
    'on',
    'to',
    'for',
    'with',
    'that',
    'this',
    'is',
    'are',
    'was',
    'were',
    'be',
    'as',
    'by',
    'from',
    'at',
    'it',
    'its',
    'remains',
    'forms',
    'one',
    'also',
    'has',
    'have',
    'can',
    'will',
    'should',
    'requires',
    'predicts',
    'proposes',
    'obtained',
    'produce',
    'produces',
    'show',
    'shows',
    'government',
  ])

  // Prefer contentful nouns from the first two sentences rather than a truncated clause.
  const sample = essay
    .split(/(?<=[.!?])\s+|\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 12)
    .slice(0, 2)
    .join(' ')

  const words = sample
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()))
    .slice(0, 5)

  if (words.length < 2) return 'Untitled draft'
  const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  return looksLikeTitle(title) ? title : 'Untitled draft'
}
