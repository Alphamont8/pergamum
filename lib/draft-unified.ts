import type { DraftSection } from '@/types'
import { contentToHtml } from '@/state/essayInitial'

export function buildUnifiedDraftHtml(sections: DraftSection[]): string {
  if (sections.length === 0) return '<p></p>'
  return sections
    .map((s) => {
      const title = s.label || 'Section'
      const body = s.html?.trim() || contentToHtml(s.content)
      const bodyContent = body && body !== '<p></p>' ? body : '<p></p>'
      return `<h2 data-section-id="${s.id}">${escapeHtml(title)}</h2>${bodyContent}`
    })
    .join('')
}

export function parseUnifiedDraftHtml(
  html: string,
  sectionOrder: DraftSection[],
): { sections: Array<{ id: string; label: string; html: string; content: string }> } {
  if (typeof document === 'undefined') {
    return { sections: sectionOrder.map((s) => ({ id: s.id, label: s.label, html: s.html, content: s.content })) }
  }

  const container = document.createElement('div')
  container.innerHTML = html

  const results: Array<{ id: string; label: string; html: string; content: string }> = []
  let currentId: string | null = null
  let currentLabel = ''
  let currentNodes: Node[] = []

  const flush = () => {
    if (!currentId) return
    const frag = document.createElement('div')
    currentNodes.forEach((n) => frag.appendChild(n.cloneNode(true)))
    const sectionHtml = frag.innerHTML.trim() || '<p></p>'
    const text = frag.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    results.push({
      id: currentId,
      label: currentLabel,
      html: sectionHtml,
      content: text,
    })
    currentNodes = []
  }

  for (const child of Array.from(container.childNodes)) {
    if (
      child instanceof HTMLElement &&
      child.hasAttribute('data-section-id') &&
      ['H1', 'H2', 'H3', 'P'].includes(child.tagName)
    ) {
      flush()
      currentId = child.getAttribute('data-section-id')
      currentLabel = child.textContent?.trim() ?? ''
      continue
    }
    if (currentId) currentNodes.push(child)
  }
  flush()

  // Preserve sections that were removed from doc by re-adding empty entries
  const byId = new Map(results.map((r) => [r.id, r]))
  const ordered = sectionOrder.map((s) => {
    const found = byId.get(s.id)
    if (found) return found
    return { id: s.id, label: s.label, html: '<p></p>', content: '' }
  })

  return { sections: ordered }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}
