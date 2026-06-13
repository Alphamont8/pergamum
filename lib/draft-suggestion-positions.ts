import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { DraftSuggestion } from '@/types'

export interface DocRange {
  from: number
  to: number
}

function getSectionContentBounds(
  doc: ProseMirrorNode,
  sectionId: string,
): { start: number; end: number } | null {
  let start: number | null = null
  let end: number | null = null

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading' || !node.attrs.sectionId) return
    const id = node.attrs.sectionId as string
    if (id === sectionId) {
      start = pos + node.nodeSize
      return
    }
    if (start != null && end == null && id !== sectionId) {
      end = pos
    }
  })

  if (start == null) return null
  return { start, end: end ?? doc.content.size }
}

function mapCharRangeInSection(
  doc: ProseMirrorNode,
  sectionId: string,
  charFrom: number,
  charTo: number,
): DocRange | null {
  const bounds = getSectionContentBounds(doc, sectionId)
  if (!bounds || charFrom >= charTo) return null

  let offset = 0
  let from: number | null = null
  let to: number | null = null

  doc.nodesBetween(bounds.start, bounds.end, (node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text
    const nodeStart = offset
    const nodeEnd = offset + text.length

    if (from == null && charFrom >= nodeStart && charFrom < nodeEnd) {
      from = pos + (charFrom - nodeStart)
    }
    if (to == null && charTo > nodeStart && charTo <= nodeEnd) {
      to = pos + (charTo - nodeStart)
    }
    offset = nodeEnd
  })

  if (from == null || to == null || to <= from) return null
  return { from, to }
}

function findTargetInSection(
  doc: ProseMirrorNode,
  sectionId: string,
  targetText: string,
): DocRange | null {
  const needle = targetText.trim()
  if (!needle) return null

  const bounds = getSectionContentBounds(doc, sectionId)
  if (!bounds) return null

  let found: DocRange | null = null

  doc.nodesBetween(bounds.start, bounds.end, (node, pos) => {
    if (found || !node.isText || !node.text) return
    const idx = node.text.indexOf(needle)
    if (idx >= 0) {
      found = { from: pos + idx, to: pos + idx + needle.length }
      return false
    }
  })

  if (found) return found

  // Fallback: search across concatenated section text offsets
  let sectionText = ''
  doc.nodesBetween(bounds.start, bounds.end, (node) => {
    if (node.isText && node.text) sectionText += node.text
  })
  const idx = sectionText.indexOf(needle)
  if (idx < 0) return null
  return mapCharRangeInSection(doc, sectionId, idx, idx + needle.length)
}

function findTargetInDocument(doc: ProseMirrorNode, targetText: string): DocRange | null {
  const needle = targetText.trim()
  if (!needle) return null
  let found: DocRange | null = null
  doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return
    const idx = node.text.indexOf(needle)
    if (idx >= 0) {
      found = { from: pos + idx, to: pos + idx + needle.length }
    }
  })
  return found
}

export function resolveSuggestionDocRange(
  doc: ProseMirrorNode,
  suggestion: DraftSuggestion,
): DocRange | null {
  const sectionId = suggestion.range?.sectionId ?? suggestion.sectionId

  if (suggestion.range && sectionId) {
    const mapped = mapCharRangeInSection(
      doc,
      sectionId,
      suggestion.range.from,
      suggestion.range.to,
    )
    if (mapped) return mapped
  }

  if (suggestion.targetText) {
    if (sectionId) {
      const inSection = findTargetInSection(doc, sectionId, suggestion.targetText)
      if (inSection) return inSection
    }
    return findTargetInDocument(doc, suggestion.targetText)
  }

  return null
}
