import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx'
import type { BibliographyEntry, SourceRecord } from '@/types'
import {
  buildBibTeX,
  buildMarkdownBibliography,
  buildPlainBibliography,
  buildRIS,
  downloadBlob,
  downloadText,
  type ExportBibliographyOptions,
} from '@/lib/citations/export'

/** Brand tokens mirrored for print / Word (keep in sync with styles/tokens.css light theme). */
const BRAND = {
  ink: '1A1A1A',
  subtle: '9A9A9A',
  accent: '2F5D50',
  hairline: 'E6E6E6',
  /** Closest widely installed sans to Hanken Grotesk. */
  font: 'Calibri',
} as const

export interface DraftExportPayload {
  title: string
  essay: string
  bibliography: string[]
  /** Optional structured sources for BibTeX / RIS when available. */
  sources?: SourceRecord[]
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'draft'
  )
}

function essayParagraphs(essay: string): string[] {
  return essay
    .split(/\n\s*\n/)
    .map((block) => block.replace(/\n+/g, ' ').trim())
    .filter(Boolean)
}

function bibliographyEntriesFromStrings(lines: string[]): BibliographyEntry[] {
  return lines.map((formatted, i) => ({
    sourceId: `export-${i}`,
    formatted,
    group: 'cited' as const,
    citationNumber: i + 1,
    citationIds: [],
    citationCount: 1,
  }))
}

function bibOptions(payload: DraftExportPayload): ExportBibliographyOptions {
  const entries = bibliographyEntriesFromStrings(payload.bibliography)
  return {
    scope: 'cited',
    annotated: false,
    entries,
    sources: payload.sources ?? [],
    title: 'References',
  }
}

/** Minimal SourceRecord stubs so BibTeX/RIS still emit something useful from titles alone. */
export function sourcesFromBibliographyLines(lines: string[]): SourceRecord[] {
  return lines.map((line, i) => ({
    id: `export-${i}`,
    title: line.slice(0, 180) || `Source ${i + 1}`,
    type: 'secondary',
  }))
}

function accentRule(): Paragraph {
  return new Paragraph({
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 12,
        color: BRAND.accent,
        space: 1,
      },
    },
    spacing: { after: 360 },
    children: [],
  })
}

export async function exportDraftDocx(payload: DraftExportPayload): Promise<void> {
  const children: Paragraph[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'PERGAMUM',
          font: BRAND.font,
          size: 16,
          bold: true,
          color: BRAND.accent,
          characterSpacing: 120,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: payload.title,
          font: BRAND.font,
          size: 36,
          bold: true,
          color: BRAND.ink,
        }),
      ],
    }),
    accentRule(),
  ]

  for (const text of essayParagraphs(payload.essay)) {
    children.push(
      new Paragraph({
        spacing: { after: 240, line: 360 },
        alignment: AlignmentType.JUSTIFIED,
        children: [
          new TextRun({
            text,
            font: BRAND.font,
            size: 22,
            color: BRAND.ink,
          }),
        ],
      }),
    )
  }

  if (payload.bibliography.length) {
    children.push(
      new Paragraph({
        spacing: { before: 480, after: 200 },
        border: {
          top: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: BRAND.hairline,
            space: 18,
          },
        },
        children: [
          new TextRun({
            text: 'REFERENCES',
            font: BRAND.font,
            size: 18,
            bold: true,
            color: BRAND.accent,
            characterSpacing: 100,
          }),
        ],
      }),
    )
    for (const entry of payload.bibliography) {
      children.push(
        new Paragraph({
          spacing: { after: 160, line: 312 },
          indent: { left: convertInchesToTwip(0.35), hanging: convertInchesToTwip(0.35) },
          children: [
            new TextRun({
              text: entry,
              font: BRAND.font,
              size: 20,
              color: BRAND.ink,
            }),
          ],
        }),
      )
    }
  }

  const doc = new Document({
    creator: 'Pergamum',
    title: payload.title,
    description: 'Draft exported from Pergamum',
    styles: {
      default: {
        document: {
          run: {
            font: BRAND.font,
            size: 22,
            color: BRAND.ink,
          },
          paragraph: {
            spacing: { line: 360 },
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Cited with Pergamum',
                    font: BRAND.font,
                    size: 16,
                    color: BRAND.subtle,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `${slugify(payload.title)}.docx`)
}

/** Opens a print-ready window so the user can Save as PDF. */
export function exportDraftPdf(payload: DraftExportPayload): void {
  const paragraphs = essayParagraphs(payload.essay)
    .map((p) => `<p class="body">${escapeHtml(p)}</p>`)
    .join('\n')

  const bibHtml = payload.bibliography.length
    ? `<section class="refs">
        <h2>References</h2>
        <ol>
          ${payload.bibliography.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
        </ol>
      </section>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(payload.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --ink: #1a1a1a;
      --muted: #6b6b6b;
      --subtle: #9a9a9a;
      --accent: #2f5d50;
      --paper: #fafafa;
      --hairline: rgba(26, 26, 26, 0.08);
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--paper);
      color: var(--ink);
      font-family: "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    .sheet {
      width: min(100%, 42rem);
      margin: 0 auto;
      padding: 3.25rem 1.75rem 4rem;
    }

    .brand {
      margin: 0 0 0.85rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
    }

    h1 {
      margin: 0;
      font-size: clamp(1.55rem, 3.2vw, 1.9rem);
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
      color: var(--ink);
    }

    .rule {
      margin: 1.15rem 0 1.75rem;
      border: 0;
      border-top: 2px solid var(--accent);
      width: 2.75rem;
    }

    .body {
      margin: 0 0 1.15rem;
      font-size: 1rem;
      font-weight: 400;
      line-height: 1.75;
      color: var(--ink);
      text-align: justify;
      hyphens: auto;
    }

    .body:last-of-type {
      margin-bottom: 0;
    }

    .refs {
      margin-top: 2.75rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--hairline);
    }

    .refs h2 {
      margin: 0 0 1rem;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
    }

    .refs ol {
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: ref;
    }

    .refs li {
      position: relative;
      margin: 0 0 0.85rem;
      padding-left: 0;
      font-size: 0.9rem;
      line-height: 1.55;
      color: var(--ink);
      text-indent: -1.35rem;
      padding-left: 1.35rem;
    }

    .refs li::before {
      counter-increment: ref;
      content: counter(ref) ".";
      display: inline-block;
      min-width: 1.15rem;
      margin-right: 0.2rem;
      color: var(--muted);
      font-weight: 500;
      font-variant-numeric: tabular-nums;
    }

    .foot {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--hairline);
      font-size: 0.75rem;
      font-weight: 400;
      font-style: italic;
      color: var(--subtle);
      text-align: center;
    }

    @media print {
      @page {
        margin: 0.85in 0.9in 1in;
      }

      html, body {
        background: #fff;
      }

      .sheet {
        width: auto;
        max-width: none;
        margin: 0;
        padding: 0;
      }

      .foot {
        position: running(footer);
      }

      a {
        color: inherit;
        text-decoration: none;
      }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <p class="brand">Pergamum</p>
    <h1>${escapeHtml(payload.title)}</h1>
    <hr class="rule" />
    ${paragraphs}
    ${bibHtml}
    <p class="foot">Cited with Pergamum</p>
  </article>
  <script>
    window.onload = function () {
      // Give the webfont a moment to settle before the print dialog.
      setTimeout(function () { window.print(); }, 280);
    };
  </script>
</body>
</html>`

  const w = window.open('', '_blank')
  if (!w) {
    downloadText(html, `${slugify(payload.title)}.html`, 'text/html')
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}

export function exportDraftBibTeX(payload: DraftExportPayload): void {
  const sources =
    payload.sources && payload.sources.length
      ? payload.sources
      : sourcesFromBibliographyLines(payload.bibliography)
  const options = { ...bibOptions(payload), sources }
  // Prefer structured sources when present; otherwise emit one @misc per line.
  let text = buildBibTeX(options)
  if (!text.trim()) {
    text = payload.bibliography
      .map((line, i) => {
        const key = `ref${i + 1}`
        return `@misc{${key},\n  title = {${line.replace(/[{}]/g, '')}},\n}`
      })
      .join('\n\n')
  }
  downloadText(text, `${slugify(payload.title)}.bib`, 'application/x-bibtex')
}

export function exportDraftRis(payload: DraftExportPayload): void {
  const sources =
    payload.sources && payload.sources.length
      ? payload.sources
      : sourcesFromBibliographyLines(payload.bibliography)
  let text = buildRIS({ ...bibOptions(payload), sources })
  if (!text.trim()) {
    text = payload.bibliography
      .map((line) => `TY  - GEN\nTI  - ${line}\nER  - \n`)
      .join('\n')
  }
  downloadText(text, `${slugify(payload.title)}.ris`, 'application/x-research-info-systems')
}

export function exportDraftMarkdown(payload: DraftExportPayload): void {
  const bib = buildMarkdownBibliography(bibOptions(payload))
  const md = `# ${payload.title}\n\n${payload.essay}\n\n${bib}\n`
  downloadText(md, `${slugify(payload.title)}.md`, 'text/markdown')
}

export function exportDraftPlain(payload: DraftExportPayload): void {
  const bib = buildPlainBibliography(bibOptions(payload))
  const text = `${payload.title}\n\n${payload.essay}\n\n${bib}\n`
  downloadText(text, `${slugify(payload.title)}.txt`, 'text/plain')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
