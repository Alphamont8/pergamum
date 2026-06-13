"use client"

import { useCallback } from 'react'
import type {
  CitationInstance,
  EssayBlueprint,
  EssayWorkflowState,
  OutlineNode,
  ReferencingStyleId,
  SourceRecord,
} from '../../types'
import { useBibliography } from '@/hooks/useBibliography'
import {
  buildEssayDocx,
  buildEssayMarkdown,
  buildEssayPlainText,
  downloadBlob,
  printEssayPdf,
} from '@/lib/export/essay'
import { ExportMenu } from './references/ExportMenu'
import './references/references-tokens.css'
import './references/ExportMenu.css'
import './TabContent.css'

interface ExportTabProps {
  workflow: EssayWorkflowState
  blueprint: EssayBlueprint
  sources: SourceRecord[]
  citations: CitationInstance[]
  outlineNodes: OutlineNode[]
  draftSections: Array<{ id: string; label: string; html: string; content: string }>
}

export function ExportTab({
  workflow,
  blueprint,
  sources,
  citations,
  outlineNodes,
  draftSections,
}: ExportTabProps) {
  const styleId = blueprint.referencingStyleId as ReferencingStyleId
  const { entries } = useBibliography({
    sources,
    outlineNodes,
    draftSections,
    citations,
    styleId,
  })

  const exportInput = {
    blueprint,
    sections: draftSections,
    bibliography: entries,
  }

  const hasDraft = workflow.draftHasContent || workflow.draftEverGenerated
  const slug = (blueprint.title || 'essay').replace(/[^\w.-]+/g, '-').slice(0, 60)

  const exportMarkdown = useCallback(() => {
    const text = buildEssayMarkdown(exportInput)
    downloadBlob(new Blob([text], { type: 'text/markdown' }), `${slug}.md`)
  }, [exportInput, slug])

  const exportPlain = useCallback(() => {
    const text = buildEssayPlainText(exportInput)
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${slug}.txt`)
  }, [exportInput, slug])

  const exportDocx = useCallback(async () => {
    const blob = await buildEssayDocx(exportInput)
    downloadBlob(blob, `${slug}.docx`)
  }, [exportInput, slug])

  const exportPdf = useCallback(() => {
    printEssayPdf(exportInput)
  }, [exportInput])

  return (
    <div className="tab-content" style={{ padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 className="page-title" style={{ margin: 0 }}>Export</h2>
        <ExportMenu
          entries={entries}
          sources={sources}
          title="References"
          disabled={styleId === 'none'}
        />
      </div>
      <p className="tab-content__lead">
        Export your finished essay, bibliography, and outline in your preferred format.
      </p>

      {hasDraft ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          <button type="button" className="glass-btn glass-btn--primary" onClick={() => void exportDocx()}>
            Download DOCX
          </button>
          <button type="button" className="glass-btn" onClick={exportMarkdown}>
            Download Markdown
          </button>
          <button type="button" className="glass-btn" onClick={exportPlain}>
            Download TXT
          </button>
          <button type="button" className="glass-btn" onClick={exportPdf}>
            Print / Save PDF
          </button>
        </div>
      ) : (
        <p className="tab-content__placeholder">
          {workflow.blueprintApproved
            ? 'Generate your draft from the Outline tab to enable essay export.'
            : 'Complete your framework and draft before exporting.'}
        </p>
      )}
    </div>
  )
}
