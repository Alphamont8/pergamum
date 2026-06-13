import { Extension, mergeAttributes, type Editor } from '@tiptap/core'
import Paragraph from '@tiptap/extension-paragraph'
import { buildBlockStyle, parseFirstLineIndent, type BlockStyleAttrs } from './block-styles'

export const IndentParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      firstLineIndent: {
        default: 0,
        parseHTML: (element: HTMLElement) => parseFirstLineIndent(element.style.textIndent),
      },
      sectionId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-section-id'),
        renderHTML: (attributes) => {
          if (!attributes.sectionId) return {}
          return { 'data-section-id': attributes.sectionId }
        },
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const style = buildBlockStyle(node.attrs as BlockStyleAttrs)
    return ['p', mergeAttributes(HTMLAttributes, style ? { style } : {}), 0]
  },
})

function getFirstLineIndent(editor: Editor): number {
  const { $from } = editor.state.selection
  if ($from.parent.type.name !== 'paragraph') return 0
  return ($from.parent.attrs.firstLineIndent as number) ?? 0
}

export function indentParagraph(editor: Editor): boolean {
  if (getFirstLineIndent(editor) > 0) return false
  return editor.chain().focus().updateAttributes('paragraph', { firstLineIndent: 1 }).run()
}

export function outdentParagraph(editor: Editor): boolean {
  if (getFirstLineIndent(editor) === 0) return false
  return editor.chain().focus().updateAttributes('paragraph', { firstLineIndent: 0 }).run()
}

export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    return {
      Tab: () => indentParagraph(this.editor),
      'Shift-Tab': () => outdentParagraph(this.editor),
      Backspace: () => {
        const { $from, empty } = this.editor.state.selection
        if (!empty || $from.parent.type.name !== 'paragraph') return false
        if ($from.parentOffset !== 0) return false
        return outdentParagraph(this.editor) || false
      },
    }
  },
})
