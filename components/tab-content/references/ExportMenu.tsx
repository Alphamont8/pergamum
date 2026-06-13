'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Copy, Download, FileText } from 'lucide-react'
import type { BibliographyEntry, SourceRecord } from '@/types'
import {
  buildBibTeX,
  buildMarkdownBibliography,
  buildPlainBibliography,
  buildRIS,
  buildDocxBibliography,
  copyBibliographyToClipboard,
  downloadBlob,
  downloadText,
  type ExportScope,
} from '@/lib/citations'
import './ExportMenu.css'

interface ExportMenuProps {
  entries: BibliographyEntry[]
  sources: SourceRecord[]
  title?: string
  disabled?: boolean
}

export function ExportMenu({ entries, sources, title = 'References', disabled }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportScope>('cited')
  const [annotated, setAnnotated] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const options = { entries, sources, scope, annotated, title }

  const handleCopy = async () => {
    await copyBibliographyToClipboard(options)
    setOpen(false)
  }

  return (
    <div className="export-menu" ref={rootRef}>
      <button
        type="button"
        className="export-menu__trigger bp-btn-secondary"
        disabled={disabled || entries.length === 0}
        onClick={() => setOpen((o) => !o)}
      >
        <Download size={14} strokeWidth={1.75} />
        Export
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>

      {open && (
        <div className="export-menu__panel">
          <div className="export-menu__options">
            <label>
              <input
                type="radio"
                name="export-scope"
                checked={scope === 'cited'}
                onChange={() => setScope('cited')}
              />
              Cited only
            </label>
            <label>
              <input
                type="radio"
                name="export-scope"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
              />
              Include all sources
            </label>
            <label>
              <input
                type="checkbox"
                checked={annotated}
                onChange={(e) => setAnnotated(e.target.checked)}
              />
              Annotated bibliography
            </label>
          </div>

          <div className="export-menu__actions">
            <button type="button" className="export-menu__action" onClick={handleCopy}>
              <Copy size={14} />
              Copy to clipboard
            </button>
            <button
              type="button"
              className="export-menu__action"
              onClick={() => {
                downloadText(buildPlainBibliography(options), 'references.txt')
                setOpen(false)
              }}
            >
              <FileText size={14} />
              Plain text (.txt)
            </button>
            <button
              type="button"
              className="export-menu__action"
              onClick={() => {
                downloadText(buildMarkdownBibliography(options), 'references.md', 'text/markdown')
                setOpen(false)
              }}
            >
              <FileText size={14} />
              Markdown (.md)
            </button>
            <button
              type="button"
              className="export-menu__action"
              onClick={async () => {
                const blob = await buildDocxBibliography(options)
                downloadBlob(blob, 'references.docx')
                setOpen(false)
              }}
            >
              <FileText size={14} />
              Word (.docx)
            </button>
            <button
              type="button"
              className="export-menu__action"
              onClick={() => {
                downloadText(buildBibTeX(options), 'references.bib')
                setOpen(false)
              }}
            >
              <FileText size={14} />
              BibTeX (.bib)
            </button>
            <button
              type="button"
              className="export-menu__action"
              onClick={() => {
                downloadText(buildRIS(options), 'references.ris')
                setOpen(false)
              }}
            >
              <FileText size={14} />
              RIS (.ris)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
