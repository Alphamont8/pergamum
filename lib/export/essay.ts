import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { BibliographyEntry, EssayBlueprint } from '@/types'

export interface EssayExportInput {
  blueprint: EssayBlueprint
  sections: Array<{ id: string; label: string; html: string; content: string }>
  bibliography?: BibliographyEntry[]
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\n/g, '\n')
    .trim()
}

export function buildEssayMarkdown(input: EssayExportInput): string {
  const lines: string[] = [`# ${input.blueprint.title || 'Untitled Essay'}`, '']
  if (input.blueprint.thesis) {
    lines.push(`> ${input.blueprint.thesis}`, '')
  }
  for (const section of input.sections) {
    if (!section.content.trim() && !section.html.trim()) continue
    lines.push(`## ${section.label}`, '', stripHtml(section.html || section.content), '')
  }
  if (input.bibliography?.length) {
    lines.push('## References', '')
    input.bibliography.forEach((entry, i) => {
      const prefix = entry.citationNumber != null ? `[${entry.citationNumber}] ` : `${i + 1}. `
      lines.push(`${prefix}${entry.formatted}`)
    })
  }
  return lines.join('\n').trim()
}

export function buildEssayPlainText(input: EssayExportInput): string {
  return buildEssayMarkdown(input)
    .replace(/^#+\s/gm, '')
    .replace(/^>\s/gm, '')
}

export async function buildEssayDocx(input: EssayExportInput): Promise<Blob> {
  const children: Paragraph[] = [
    new Paragraph({
      text: input.blueprint.title || 'Untitled Essay',
      heading: HeadingLevel.TITLE,
    }),
  ]
  if (input.blueprint.thesis) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: input.blueprint.thesis, italics: true })],
      }),
    )
  }
  for (const section of input.sections) {
    const text = stripHtml(section.html || section.content)
    if (!text) continue
    children.push(
      new Paragraph({ text: section.label, heading: HeadingLevel.HEADING_2 }),
      new Paragraph(text),
    )
  }
  if (input.bibliography?.length) {
    children.push(new Paragraph({ text: 'References', heading: HeadingLevel.HEADING_2 }))
    input.bibliography.forEach((entry, i) => {
      const prefix = entry.citationNumber != null ? `[${entry.citationNumber}] ` : `${i + 1}. `
      children.push(new Paragraph(`${prefix}${entry.formatted}`))
    })
  }
  const doc = new Document({ sections: [{ children }] })
  const buffer = await Packer.toBlob(doc)
  return buffer
}

export function buildEssayPrintHtml(input: EssayExportInput): string {
  const body = input.sections
    .map((s) => {
      const content = s.html || `<p>${s.content}</p>`
      return `<section><h2>${s.label}</h2>${content}</section>`
    })
    .join('\n')
  const bib =
    input.bibliography?.length
      ? `<section><h2>References</h2><ol>${input.bibliography.map((e) => `<li>${e.formatted}</li>`).join('')}</ol></section>`
      : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${input.blueprint.title || 'Essay'}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:2rem auto;line-height:1.6}h1,h2{margin-top:1.5em}</style>
</head><body><h1>${input.blueprint.title || 'Untitled Essay'}</h1>
${input.blueprint.thesis ? `<p><em>${input.blueprint.thesis}</em></p>` : ''}
${body}${bib}</body></html>`
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function printEssayPdf(input: EssayExportInput) {
  const html = buildEssayPrintHtml(input)
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
