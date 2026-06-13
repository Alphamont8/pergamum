import type { Editor } from '@tiptap/core'
import { buildBlockStyle, type BlockStyleAttrs } from './block-styles'

export const LINE_HEIGHT_OPTIONS = [
  { label: 'Single', value: '1.15' },
  { label: '1.5', value: '1.5' },
  { label: 'Double', value: '2' },
] as const

export const MARGIN_BEFORE_OPTIONS = [
  { label: 'No space before', value: 0 },
  { label: '8 pt before', value: 8 },
  { label: '16 pt before', value: 16 },
] as const

export const MARGIN_AFTER_OPTIONS = [
  { label: 'No space after', value: 0 },
  { label: '8 pt after', value: 8 },
  { label: '16 pt after', value: 16 },
] as const

export const spacingAttrDefs = {
  lineHeight: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
  },
  marginBefore: {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const v = element.style.marginTop
      if (!v) return null
      const px = Number.parseInt(v, 10)
      return Number.isNaN(px) ? null : px
    },
  },
  marginAfter: {
    default: null as number | null,
    parseHTML: (element: HTMLElement) => {
      const v = element.style.marginBottom
      if (!v) return null
      const px = Number.parseInt(v, 10)
      return Number.isNaN(px) ? null : px
    },
  },
}

export function renderBlockWithStyle(
  tag: string,
  attrs: BlockStyleAttrs,
  htmlAttrs: Record<string, unknown>,
): [string, Record<string, unknown>, number] {
  const style = buildBlockStyle(attrs)
  return [tag, style ? { ...htmlAttrs, style } : htmlAttrs, 0]
}

function blockTypeName(editor: Editor): string | null {
  const type = editor.state.selection.$from.parent.type.name
  if (type === 'paragraph' || type === 'heading') return type
  return null
}

export function getSpacingState(editor: Editor): {
  lineHeight: string
  marginBefore: number
  marginAfter: number | null
} {
  const type = blockTypeName(editor)
  if (!type) {
    return { lineHeight: '1.15', marginBefore: 0, marginAfter: null }
  }
  const attrs = editor.getAttributes(type)
  return {
    lineHeight: (attrs.lineHeight as string | null) ?? '1.15',
    marginBefore: (attrs.marginBefore as number | null) ?? 0,
    marginAfter: (attrs.marginAfter as number | null) ?? null,
  }
}

export function setLineHeight(editor: Editor, lineHeight: string): boolean {
  const type = blockTypeName(editor)
  if (!type) return false
  return editor.chain().focus().updateAttributes(type, { lineHeight }).run()
}

export function setMarginBefore(editor: Editor, marginBefore: number): boolean {
  const type = blockTypeName(editor)
  if (!type) return false
  return editor
    .chain()
    .focus()
    .updateAttributes(type, { marginBefore: marginBefore || null })
    .run()
}

export function setMarginAfter(editor: Editor, marginAfter: number): boolean {
  const type = blockTypeName(editor)
  if (!type) return false
  return editor
    .chain()
    .focus()
    .updateAttributes(type, { marginAfter: marginAfter >= 0 ? marginAfter : null })
    .run()
}
