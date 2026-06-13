import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { DraftSuggestion } from '@/types'
import { resolveSuggestionDocRange } from '@/lib/draft-suggestion-positions'

export const suggestionHighlightKey = new PluginKey('suggestionHighlight')

export interface SuggestionHighlightOptions {
  suggestions: DraftSuggestion[]
  enabled: boolean
  onSuggestionClick?: (suggestionId: string) => void
}

function buildDecorations(
  doc: import('@tiptap/pm/model').Node,
  suggestions: DraftSuggestion[],
  enabled: boolean,
): DecorationSet {
  if (!enabled || suggestions.length === 0) return DecorationSet.empty

  const decorations: Decoration[] = []
  for (const suggestion of suggestions) {
    if (suggestion.status !== 'open') continue
    const positions = resolveSuggestionDocRange(doc, suggestion)
    if (!positions) continue
    const { from, to } = positions
    if (from < 0 || to <= from) continue
    const maxPos = doc.content.size
    const safeFrom = Math.max(0, Math.min(from, maxPos))
    const safeTo = Math.max(safeFrom + 1, Math.min(to, maxPos))
    if (safeTo > maxPos) continue

    decorations.push(
      Decoration.inline(safeFrom, safeTo, {
        class: `draft-suggestion-hl draft-suggestion-hl--${suggestion.tool}`,
        'data-suggestion-id': suggestion.id,
        title: suggestion.message,
      }),
    )
  }
  return DecorationSet.create(doc, decorations)
}

export const SuggestionHighlight = Extension.create<SuggestionHighlightOptions>({
  name: 'suggestionHighlight',

  addOptions() {
    return {
      suggestions: [],
      enabled: true,
      onSuggestionClick: undefined,
    }
  },

  addProseMirrorPlugins() {
    const { options } = this
    return [
      new Plugin({
        key: suggestionHighlightKey,
        props: {
          decorations: (state) => {
            return buildDecorations(state.doc, options.suggestions, options.enabled)
          },
          handleClick: (_view, _pos, event) => {
            const target = event.target as HTMLElement
            const id = target.closest('[data-suggestion-id]')?.getAttribute('data-suggestion-id')
            if (id && options.onSuggestionClick) {
              options.onSuggestionClick(id)
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
