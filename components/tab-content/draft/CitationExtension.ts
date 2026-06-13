import { Node, mergeAttributes } from '@tiptap/core'

export interface CitationOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    citation: {
      insertCitation: (attrs: {
        citationId: string
        sourceId: string
        label: string
        citationNumber?: number
        locator?: string
      }) => ReturnType
    }
  }
}

export const Citation = Node.create<CitationOptions>({
  name: 'citation',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      citationId: { default: null },
      sourceId: { default: null },
      label: { default: '' },
      citationNumber: { default: null },
      locator: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-citation-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-citation-id': node.attrs.citationId,
        'data-source-id': node.attrs.sourceId,
        class: 'draft-citation',
        ...(node.attrs.citationNumber != null
          ? { 'data-citation-number': node.attrs.citationNumber }
          : {}),
        ...(node.attrs.locator ? { 'data-locator': node.attrs.locator } : {}),
      }),
      node.attrs.label,
    ]
  },

  addCommands() {
    return {
      insertCitation:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },
})
