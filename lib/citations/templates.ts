import { plugins } from '@citation-js/core'
import type { ReferencingStyleId } from '@/types'
import { isBluebookStyle, normalizeReferencingStyleId } from '@/utils/referencingStyle'

/** CSL style files from the official CSL repository (jsDelivr CDN). */
const REMOTE_CSL_STYLES: Record<string, string> = {
  mla: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/modern-language-association.csl',
  harvard:
    'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/harvard-cite-them-right.csl',
  'chicago-author-date':
    'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/chicago-author-date.csl',
  'chicago-notes':
    'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/chicago-note-bibliography.csl',
  ieee: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/ieee.csl',
  ama: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/american-medical-association.csl',
  acs: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/american-chemical-society.csl',
  asa: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/american-sociological-association.csl',
  nature: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/nature.csl',
  science: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/science.csl',
  mhra: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/modern-humanities-research-association.csl',
  oscola: 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master/oscola.csl',
}

/** Maps app referencing style IDs to Citation.js template names. */
const STYLE_TO_TEMPLATE: Record<string, string> = {
  apa: 'apa',
  mla: 'mla',
  harvard: 'harvard',
  'chicago-author-date': 'chicago-author-date',
  'chicago-notes': 'chicago-notes',
  ieee: 'ieee',
  vancouver: 'vancouver',
  ama: 'ama',
  acs: 'acs',
  asa: 'asa',
  nature: 'nature',
  science: 'science',
  mhra: 'mhra',
  oscola: 'oscola',
}

const fetchedTemplates = new Map<string, string>()
let initPromise: Promise<void> | null = null

function getCslConfig(): {
  templates: { has: (n: string) => boolean; add: (n: string, xml: string) => void }
} | null {
  try {
    return plugins.config.get('@csl') as {
      templates: { has: (n: string) => boolean; add: (n: string, xml: string) => void }
    }
  } catch {
    return null
  }
}

async function fetchTemplateXml(url: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok) return null
  return res.text()
}

export async function ensureCitationTemplates(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    await import('@citation-js/plugin-csl')
    const config = getCslConfig()
    if (!config) return

    for (const [name, url] of Object.entries(REMOTE_CSL_STYLES)) {
      if (config.templates.has(name)) continue
      const cached = fetchedTemplates.get(name)
      if (cached) {
        config.templates.add(name, cached)
        continue
      }
      const xml = await fetchTemplateXml(url)
      if (xml) {
        fetchedTemplates.set(name, xml)
        config.templates.add(name, xml)
      }
    }
  })()

  return initPromise
}

export function resolveCitationTemplate(styleId: ReferencingStyleId): string | null {
  const id = normalizeReferencingStyleId(styleId)
  if (id === 'none' || isBluebookStyle(id)) return null
  return STYLE_TO_TEMPLATE[id] ?? 'apa'
}

export function clearTemplateInit(): void {
  initPromise = null
}
