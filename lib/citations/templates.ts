import { plugins } from '@citation-js/core'
import type { ReferencingStyleId } from '@/types'
import { isBluebookStyle, normalizeReferencingStyleId } from '@/utils/referencingStyle'

const CSL_CDN = 'https://cdn.jsdelivr.net/gh/citation-style-language/styles@master'

/**
 * CSL style files from the official CSL repository.
 * Names here are the Citation.js template keys we register.
 * Built-ins already present: apa, vancouver, harvard1.
 */
const REMOTE_CSL_STYLES: Record<string, string> = {
  mla: `${CSL_CDN}/modern-language-association.csl`,
  // Prefer Cite Them Right Harvard; harvard1 remains the offline built-in fallback.
  harvard: `${CSL_CDN}/harvard-cite-them-right.csl`,
  'chicago-author-date': `${CSL_CDN}/chicago-author-date.csl`,
  'chicago-notes': `${CSL_CDN}/chicago-note-bibliography.csl`,
  ieee: `${CSL_CDN}/ieee.csl`,
  // Refresh built-in Vancouver with the official CSL Vancouver (ICMJE family).
  vancouver: `${CSL_CDN}/vancouver.csl`,
  ama: `${CSL_CDN}/american-medical-association.csl`,
  acs: `${CSL_CDN}/american-chemical-society.csl`,
  asa: `${CSL_CDN}/american-sociological-association.csl`,
  nature: `${CSL_CDN}/nature.csl`,
  science: `${CSL_CDN}/science.csl`,
  mhra: `${CSL_CDN}/modern-humanities-research-association.csl`,
  oscola: `${CSL_CDN}/oscola.csl`,
}

/** Maps app referencing style IDs to preferred Citation.js template names. */
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

/** Offline / built-in substitutes when a preferred remote template did not load. */
const TEMPLATE_FALLBACKS: Record<string, string[]> = {
  harvard: ['harvard1'],
  vancouver: ['vancouver'],
  apa: ['apa'],
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
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.text()
  } catch {
    return null
  }
}

export async function ensureCitationTemplates(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    await import('@citation-js/plugin-csl')
    const config = getCslConfig()
    if (!config) return

    await Promise.all(
      Object.entries(REMOTE_CSL_STYLES).map(async ([name, url]) => {
        const cached = fetchedTemplates.get(name)
        if (cached) {
          config.templates.add(name, cached)
          return
        }
        const xml = await fetchTemplateXml(url)
        if (xml) {
          fetchedTemplates.set(name, xml)
          // Always register/overwrite so remote Vancouver refreshes the built-in copy.
          config.templates.add(name, xml)
        }
      }),
    )
  })()

  return initPromise
}

/** Preferred template name for a style (may not be loaded yet). */
export function resolveCitationTemplate(styleId: ReferencingStyleId): string | null {
  const id = normalizeReferencingStyleId(styleId)
  if (id === 'none' || isBluebookStyle(id)) return null
  return STYLE_TO_TEMPLATE[id] ?? null
}

/**
 * Template that is actually registered and safe to pass to Citation.js.
 * Returns null when missing so callers use string fallbacks instead of silent APA.
 */
export function getUsableCitationTemplate(styleId: ReferencingStyleId): string | null {
  const preferred = resolveCitationTemplate(styleId)
  if (!preferred) return null

  const config = getCslConfig()
  if (!config) return null

  if (config.templates.has(preferred)) return preferred

  for (const alt of TEMPLATE_FALLBACKS[preferred] ?? []) {
    if (config.templates.has(alt)) return alt
  }

  return null
}

export function clearTemplateInit(): void {
  initPromise = null
}
