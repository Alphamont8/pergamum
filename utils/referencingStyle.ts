import type { CitationStyle, ReferencingStyleId } from '../types'

export function referencingStyleToCitationStyle(id: ReferencingStyleId): CitationStyle {
  if (id === 'none') return 'APA'
  if (id.startsWith('mla')) return 'MLA'
  if (id.startsWith('harvard')) return 'Harvard'
  if (id.startsWith('chicago')) return 'Chicago'
  if (id === 'ieee' || id === 'vancouver' || id === 'bluebook') return 'Chicago'
  return 'APA'
}

export function isNumericReferencingStyle(id: ReferencingStyleId): boolean {
  return id === 'ieee' || id === 'vancouver'
}

export function isNotesReferencingStyle(id: ReferencingStyleId): boolean {
  return id === 'chicago-notes'
}

export function isBluebookStyle(id: ReferencingStyleId): boolean {
  return id === 'bluebook'
}

export function referencingStyleHasCitations(id: ReferencingStyleId): boolean {
  return id !== 'none'
}

export function citationStyleToReferencingStyle(style: CitationStyle): ReferencingStyleId {
  switch (style) {
    case 'MLA':
      return 'mla'
    case 'Harvard':
      return 'harvard'
    case 'Chicago':
      return 'chicago-author-date'
    default:
      return 'apa'
  }
}

export function resolvedWritingStyle(blueprint: {
  quickSettings: { writingStyle: string; writingStyleIsAuto: boolean }
  writingStyle: string
}): string {
  if (blueprint.quickSettings.writingStyleIsAuto) return blueprint.writingStyle
  return blueprint.quickSettings.writingStyle === 'Auto'
    ? blueprint.writingStyle
    : blueprint.quickSettings.writingStyle
}

export function resolvedReadingLevel(blueprint: {
  quickSettings: { readingLevel: string; readingLevelIsAuto: boolean }
  readingLevel: string
}): string {
  if (blueprint.quickSettings.readingLevelIsAuto) return blueprint.readingLevel
  return blueprint.quickSettings.readingLevel === 'Auto'
    ? blueprint.readingLevel
    : blueprint.quickSettings.readingLevel
}

export function resolvedReferencingStyleId(blueprint: {
  referencingStyleId: ReferencingStyleId
  quickSettings: {
    referencingStyle: ReferencingStyleId | 'Auto' | 'none'
    referencingStyleIsAuto: boolean
  }
}): ReferencingStyleId {
  const qs = blueprint.quickSettings.referencingStyle
  if (qs === 'none') return 'none'
  if (!blueprint.quickSettings.referencingStyleIsAuto && qs !== 'Auto') return qs
  return blueprint.referencingStyleId
}
