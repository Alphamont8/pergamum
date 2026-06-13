import { Document, Packer, Paragraph, TextRun } from 'docx'
import type { BibliographyEntry, SourceRecord } from '@/types'

export type ExportScope = 'cited' | 'all'

export interface ExportBibliographyOptions {
  scope: ExportScope
  annotated: boolean
  entries: BibliographyEntry[]
  sources: SourceRecord[]
  title?: string
}

function filterEntries(
  entries: BibliographyEntry[],
  scope: ExportScope,
): BibliographyEntry[] {
  if (scope === 'all') return entries
  return entries.filter((e) => e.group === 'cited')
}

function annotationForSource(source: SourceRecord): string {
  const parts: string[] = []
  if (source.summary) parts.push(source.summary)
  if (source.reliability) {
    parts.push(
      `Reliability: ${source.reliability.overall}/100 (${source.reliability.band}).`,
    )
  }
  return parts.join(' ')
}

export function buildPlainBibliography(options: ExportBibliographyOptions): string {
  const { entries, sources, annotated, title = 'References' } = options
  const filtered = filterEntries(entries, options.scope)
  const lines = [title, '']
  filtered.forEach((entry, i) => {
    const prefix = entry.citationNumber != null ? `[${entry.citationNumber}] ` : `${i + 1}. `
    lines.push(`${prefix}${entry.formatted}`)
    if (annotated) {
      const source = sources.find((s) => s.id === entry.sourceId)
      if (source) {
        const note = annotationForSource(source)
        if (note) lines.push(`   ${note}`)
      }
    }
    lines.push('')
  })
  return lines.join('\n').trim()
}

export function buildMarkdownBibliography(options: ExportBibliographyOptions): string {
  const { entries, sources, annotated, title = 'References' } = options
  const filtered = filterEntries(entries, options.scope)
  const lines = [`## ${title}`, '']
  filtered.forEach((entry) => {
    lines.push(`- ${entry.formatted}`)
    if (annotated) {
      const source = sources.find((s) => s.id === entry.sourceId)
      if (source) {
        const note = annotationForSource(source)
        if (note) lines.push(`  - *${note}*`)
      }
    }
  })
  return lines.join('\n')
}

export function buildBibTeX(options: ExportBibliographyOptions): string {
  const filtered = filterEntries(options.entries, options.scope)
  const lines: string[] = []
  for (const entry of filtered) {
    const source = options.sources.find((s) => s.id === entry.sourceId)
    if (!source) continue
    const key = source.doi?.replace(/[^\w]/g, '_') ?? source.id.replace(/-/g, '_')
    const type = source.sourceKind === 'book' ? 'book' : 'article'
    lines.push(`@` + `${type}{${key},`)
    lines.push(`  title = {${source.title}},`)
    if (source.authors) lines.push(`  author = {${source.authors}},`)
    if (source.year) lines.push(`  year = {${source.year}},`)
    if (source.venue?.name) lines.push(`  journal = {${source.venue.name}},`)
    if (source.doi) lines.push(`  doi = {${source.doi}},`)
    if (source.url) lines.push(`  url = {${source.url}},`)
    lines.push('}')
    lines.push('')
  }
  return lines.join('\n')
}

export function buildRIS(options: ExportBibliographyOptions): string {
  const filtered = filterEntries(options.entries, options.scope)
  const lines: string[] = []
  for (const entry of filtered) {
    const source = options.sources.find((s) => s.id === entry.sourceId)
    if (!source) continue
    lines.push('TY  - JOUR')
    lines.push(`TI  - ${source.title}`)
    if (source.authors) {
      for (const author of source.authors.split(/(?:,| and )+/)) {
        lines.push(`AU  - ${author.trim()}`)
      }
    }
    if (source.year) lines.push(`PY  - ${source.year}`)
    if (source.venue?.name) lines.push(`JO  - ${source.venue.name}`)
    if (source.doi) lines.push(`DO  - ${source.doi}`)
    if (source.url) lines.push(`UR  - ${source.url}`)
    lines.push('ER  - ')
    lines.push('')
  }
  return lines.join('\n')
}

export async function buildDocxBibliography(
  options: ExportBibliographyOptions,
): Promise<Blob> {
  const filtered = filterEntries(options.entries, options.scope)
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: options.title ?? 'References', bold: true, size: 28 })],
    }),
  ]

  filtered.forEach((entry, i) => {
    const prefix = entry.citationNumber != null ? `[${entry.citationNumber}] ` : `${i + 1}. `
    children.push(
      new Paragraph({
        indent: { left: 720, hanging: 360 },
        children: [new TextRun({ text: `${prefix}${entry.formatted}` })],
      }),
    )
    if (options.annotated) {
      const source = options.sources.find((s) => s.id === entry.sourceId)
      const note = source ? annotationForSource(source) : ''
      if (note) {
        children.push(
          new Paragraph({
            indent: { left: 1080 },
            children: [new TextRun({ text: note, italics: true, size: 20 })],
          }),
        )
      }
    }
  })

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([content], { type: mime }), filename)
}

export async function copyBibliographyToClipboard(
  options: ExportBibliographyOptions,
): Promise<void> {
  const plain = buildPlainBibliography(options)
  const html = `<h2>${options.title ?? 'References'}</h2><ol>${filterEntries(options.entries, options.scope)
    .map((e) => `<li>${e.formatted}</li>`)
    .join('')}</ol>`
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([plain], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      }),
    ])
  } catch {
    await navigator.clipboard.writeText(plain)
  }
}
