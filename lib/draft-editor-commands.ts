import type { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import type { DraftSection } from '@/types'
import { countWords, parseUnifiedDraftHtml } from '@/lib/draft-unified'

export type BlockTypeOption = 'p' | 'h1' | 'h2' | 'h3'

export function getBlockType(editor: Editor): BlockTypeOption {
  const { $from } = editor.state.selection
  const parent = $from.parent
  if (parent.type.name === 'paragraph') return 'p'
  if (parent.type.name === 'heading') {
    const level = parent.attrs.level as number
    if (level === 1) return 'h1'
    if (level === 2) return 'h2'
    if (level === 3) return 'h3'
  }
  return 'p'
}

function getSectionId(editor: Editor): string | null {
  const { $from } = editor.state.selection
  const parent = $from.parent
  const fromParent = (parent.attrs.sectionId as string | null) ?? null
  if (fromParent) return fromParent
  const headingAttrs = editor.getAttributes('heading')
  return (headingAttrs.sectionId as string | null) ?? null
}

function marksAt(editor: Editor, pos: number): JSONContent['marks'] {
  const marks = editor.state.doc.resolve(pos).marks()
  return marks.map((m) => ({
    type: m.type.name,
    attrs: m.attrs,
  }))
}

function blockNode(
  blockType: BlockTypeOption,
  text: string,
  marks?: JSONContent['marks'],
  sectionId?: string | null,
): JSONContent {
  const content = text
    ? [{ type: 'text', text, ...(marks?.length ? { marks } : {}) }]
    : []

  if (blockType === 'p') {
    const attrs = sectionId ? { sectionId } : undefined
    return { type: 'paragraph', ...(attrs ? { attrs } : {}), content }
  }

  const level = blockType === 'h1' ? 1 : blockType === 'h2' ? 2 : 3
  const attrs: Record<string, unknown> = { level }
  if (sectionId) attrs.sectionId = sectionId
  return { type: 'heading', attrs, content }
}

function levelFromBlockType(blockType: BlockTypeOption): 1 | 2 | 3 {
  return blockType === 'h1' ? 1 : blockType === 'h2' ? 2 : 3
}

function applyToParentBlock(editor: Editor, blockType: BlockTypeOption, sectionId?: string | null): boolean {
  if (sectionId) {
    if (blockType === 'p') {
      return editor.chain().focus().setParagraph().updateAttributes('paragraph', { sectionId }).run()
    }
    return editor
      .chain()
      .focus()
      .setHeading({ level: levelFromBlockType(blockType) })
      .updateAttributes('heading', { sectionId })
      .run()
  }
  if (blockType === 'p') {
    return editor.chain().focus().setParagraph().run()
  }
  return editor.chain().focus().setHeading({ level: levelFromBlockType(blockType) }).run()
}

export function applyBlockType(editor: Editor, blockType: BlockTypeOption): boolean {
  const sectionId = getSectionId(editor)
  const { empty, from, to } = editor.state.selection
  const parentType = editor.state.selection.$from.parent.type.name

  let result = false

  if (empty || from === to) {
    result = applyToParentBlock(editor, blockType, sectionId)
  } else if (parentType === 'heading' || sectionId) {
    result = applyToParentBlock(editor, blockType, sectionId)
  } else {
    const selectedText = editor.state.doc.textBetween(from, to, '')
    if (!selectedText.trim()) return false
    const marks = marksAt(editor, from)
    result = editor
      .chain()
      .focus()
      .insertContentAt({ from, to }, blockNode(blockType, selectedText, marks))
      .run()
  }

  return result
}

export interface SectionWordCount {
  id: string
  label: string
  words: number
}

export function computeLiveWordCounts(
  editor: Editor,
  sectionOrder: DraftSection[],
): { total: number; sections: SectionWordCount[] } {
  const html = editor.getHTML()
  const { sections } = parseUnifiedDraftHtml(html, sectionOrder)
  const mapped = sections.map((s) => ({
    id: s.id,
    label: s.label || 'Section',
    words: countWords(s.label) + countWords(s.content),
  }))
  const docText = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ')
  const total = countWords(docText)
  return { total, sections: mapped }
}
