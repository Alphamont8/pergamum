import type { DraftToolKind, OutlineNode, OutlineNodeType } from '@/types'
import { findTextRangeInContent } from '@/lib/draft-utils'
import { draftToolResponseSchema } from './schemas'
import type { z } from 'zod'

export function normalizeNodeType(raw: string): OutlineNodeType {
  if (raw === 'section') return 'section'
  if (raw === 'subpoint') return 'subpoint'
  return 'point'
}

export function normalizeOutlineNodes(raw: OutlineNode[]): OutlineNode[] {
  return raw.map((n, i) => ({
    id: n.id || `node-gen-${i}`,
    parentId: n.parentId ?? null,
    type: normalizeNodeType(n.type as string),
    title: n.title || 'Untitled',
    sourceRefs: Array.isArray(n.sourceRefs) ? n.sourceRefs : [],
    collapsed: n.collapsed ?? false,
    order: typeof n.order === 'number' ? n.order : i,
  }))
}

export function parseDraftToolResponse(
  raw: string,
  tool: DraftToolKind,
  defaultSectionId: string,
  sectionContents: Map<string, string>,
) {
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return []

  try {
    const parsed = draftToolResponseSchema.parse(JSON.parse(jsonMatch[0]))
    return parsed.suggestions.map((s, i) => {
      const sectionId = s.sectionId || defaultSectionId
      const content = sectionContents.get(sectionId) ?? ''
      const range =
        s.targetText && content
          ? findTextRangeInContent(content, s.targetText)
          : undefined

      return {
        id: s.id || `sug-${tool}-${i}-${Date.now()}`,
        tool,
        sectionId,
        status: 'open' as const,
        severity: s.severity,
        message: s.message,
        targetText: s.targetText,
        suggestion: s.suggestion,
        sourceSuggestion: s.sourceSuggestion,
        alternatives: s.alternatives,
        antonyms: s.antonyms,
        targetWritingStyle: s.targetWritingStyle,
        range,
      }
    })
  } catch {
    return []
  }
}

export function extractJsonFromText<T extends z.ZodType>(
  text: string,
  schema: T,
): z.infer<T> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return schema.parse(JSON.parse(jsonMatch[0]))
  } catch {
    return null
  }
}
