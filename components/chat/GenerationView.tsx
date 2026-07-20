'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CopyLabelButton } from '@/components/ui/CopyLabelButton'
import { Dialog } from '@/components/ui/Dialog'
import { ProUpsellDialog } from '@/components/billing/ProUpsellDialog'
import { useLibrary } from '@/components/shell/LibraryContext'
import { useProfileDefaults } from '@/components/shell/ProfileDefaults'
import { formatBibliographyForCopy, formatEssayForDisplay } from '@/lib/essay/format'
import {
  exportDraftBibTeX,
  exportDraftDocx,
  exportDraftMarkdown,
  exportDraftPdf,
  exportDraftPlain,
  exportDraftRis,
} from '@/lib/essay/draftExport'
import { applyInTextCitations } from '@/lib/cite/applyInTextCitations'
import { dispatchLibrarySync, formatDraftMeta, countSuccessfulCitations } from '@/lib/library/sync'
import { labelForStyle, normalizeReferencingStyleId } from '@/utils/referencingStyle'
import '@/components/chat/chat.css'

interface GenerationRow {
  id: string
  title: string | null
  essay_input: string
  status: string
  cites_required: number
  cites_spent: number
  pinned?: boolean
  pinned_at?: string | null
  result: {
    essay?: string
    originalEssay?: string
    bibliography?: string[]
    citations?: Array<{
      index: number
      sentence: string
      status: string
      inText?: string
      correction?: string | null
      bibliography?: string
      title?: string
      errorMessage?: string
    }>
  } | null
  settings?: { styleId?: string } | null
  created_at: string
  error_message?: string | null
}

export function GenerationView({ generation }: { generation: GenerationRow }) {
  const router = useRouter()
  const { planTier } = useProfileDefaults()
  const isPro = planTier === 'pro'
  const { generations, refreshGenerations } = useLibrary()
  const result = generation.result
  const [title, setTitle] = useState(generation.title || 'Untitled draft')
  const [pinned, setPinned] = useState(Boolean(generation.pinned))
  const [editingTitle, setEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState(title)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState<'draft' | 'bibliography' | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [upsellOpen, setUpsellOpen] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTitle(generation.title || 'Untitled draft')
    setPinned(Boolean(generation.pinned))
  }, [generation.title, generation.pinned])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!exportOpen) return
    const onPointer = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [exportOpen])

  const draftText = useMemo(() => {
    const original = result?.originalEssay || generation.essay_input
    const citations = result?.citations ?? []
    if (citations.some((c) => c.inText)) {
      return applyInTextCitations(
        original,
        citations.map((c) => ({
          sentence: c.sentence,
          inText: c.inText,
          correction: null,
          accepted: false,
        })),
        generation.settings?.styleId,
      )
    }
    return result?.essay || original
  }, [generation.essay_input, generation.settings?.styleId, result])

  const displayDraft = useMemo(() => formatEssayForDisplay(draftText), [draftText])

  const bibliography = result?.bibliography ?? []
  const hasCitations = Boolean(result?.essay || (result?.citations?.length ?? 0) > 0)

  const citationsDone = countSuccessfulCitations(result?.citations)
  const styleLabel = generation.settings?.styleId
    ? labelForStyle(normalizeReferencingStyleId(generation.settings.styleId))
    : null
  const meta = formatDraftMeta(generation.created_at, citationsDone, styleLabel)

  const copyText = useCallback(async (kind: 'draft' | 'bibliography', text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(kind)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(null), 1800)
  }, [])

  async function commitTitle() {
    const next = editTitle.trim() || 'Untitled draft'
    setEditingTitle(false)
    if (next === title) return
    setTitle(next)
    dispatchLibrarySync({ action: 'title', id: generation.id, title: next })
    const res = await fetch(`/api/generations/${generation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    })
    if (!res.ok) {
      const fallback = generation.title || 'Untitled draft'
      setTitle(fallback)
      dispatchLibrarySync({ action: 'title', id: generation.id, title: fallback })
    }
  }

  async function togglePin() {
    const next = !pinned
    const optimisticAt = next ? new Date().toISOString() : null
    setPinned(next)
    dispatchLibrarySync({ action: 'pin', id: generation.id, pinned: next, pinnedAt: optimisticAt })
    const res = await fetch(`/api/generations/${generation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: next }),
    })
    if (!res.ok) {
      setPinned(!next)
      dispatchLibrarySync({
        action: 'pin',
        id: generation.id,
        pinned: !next,
        pinnedAt: generation.pinned_at ?? null,
      })
      return
    }
    const data = (await res.json()) as { generation?: { pinned_at?: string | null } }
    if (data.generation) {
      dispatchLibrarySync({
        action: 'pin',
        id: generation.id,
        pinned: next,
        pinnedAt: data.generation.pinned_at ?? null,
      })
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    let list = generations
    if (!list.length) {
      list = await refreshGenerations()
    }
    const idx = list.findIndex((g) => g.id === generation.id)
    const neighbor = list[idx + 1] ?? list[idx - 1] ?? null

    const res = await fetch(`/api/generations/${generation.id}`, { method: 'DELETE' })
    setDeleting(false)
    setDeleteOpen(false)
    if (!res.ok) return

    dispatchLibrarySync({ action: 'delete', id: generation.id })
    router.push(neighbor ? `/c/${neighbor.id}` : '/')
    router.refresh()
  }

  async function runExport(
    kind: 'docx' | 'pdf' | 'bibtex' | 'ris' | 'markdown' | 'plain',
  ) {
    if (!isPro) {
      setUpsellOpen(true)
      setExportOpen(false)
      return
    }
    const payload = {
      title,
      essay: displayDraft,
      bibliography,
    }
    setExportBusy(true)
    try {
      if (kind === 'docx') await exportDraftDocx(payload)
      else if (kind === 'pdf') exportDraftPdf(payload)
      else if (kind === 'bibtex') exportDraftBibTeX(payload)
      else if (kind === 'ris') exportDraftRis(payload)
      else if (kind === 'markdown') exportDraftMarkdown(payload)
      else exportDraftPlain(payload)
    } finally {
      setExportBusy(false)
      setExportOpen(false)
    }
  }

  return (
    <>
      <div className="pg-container generation-page">
        <div className="generation-page__head">
          <div className="generation-page__head-copy">
            <p className="pg-subtle generation-page__meta">
              {meta}
              {pinned ? (
                <>
                  {' · '}
                  <span className="generation-page__pinned">Pinned</span>
                </>
              ) : null}
            </p>
            <div className="generation-page__title-wrap">
              <h1
                className={`generation-page__title ${editingTitle ? 'is-hidden' : ''}`}
                onDoubleClick={() => {
                  setEditingTitle(true)
                  setEditTitle(title)
                }}
              >
                {title}
              </h1>
              {editingTitle ? (
                <input
                  className="generation-page__title-input"
                  value={editTitle}
                  autoFocus
                  maxLength={120}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => void commitTitle()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void commitTitle()
                    }
                    if (e.key === 'Escape') setEditingTitle(false)
                  }}
                />
              ) : null}
            </div>
          </div>
          <div className="generation-page__actions">
            <div className="generation-page__actions-row">
              <Button
                variant="success"
                size="sm"
                className="generation-page__action"
                onClick={() => void togglePin()}
              >
                {pinned ? 'Unpin Draft' : 'Pin Draft'}
              </Button>
              <div className="generation-page__export" ref={exportMenuRef}>
                <Button
                  variant={isPro ? 'success' : 'ghost'}
                  size="sm"
                  className="generation-page__action"
                  disabled={!hasCitations || exportBusy}
                  onClick={() => {
                    if (!isPro) {
                      setUpsellOpen(true)
                      return
                    }
                    setExportOpen((v) => !v)
                  }}
                >
                  {isPro ? 'Export Draft' : 'Export Draft · Pro'}
                </Button>
                {exportOpen && isPro ? (
                  <div className="generation-page__export-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void runExport('docx')}>
                      Word (.docx)
                    </button>
                    <button type="button" role="menuitem" onClick={() => void runExport('pdf')}>
                      PDF (Print)
                    </button>
                    <button type="button" role="menuitem" onClick={() => void runExport('bibtex')}>
                      BibTeX
                    </button>
                    <button type="button" role="menuitem" onClick={() => void runExport('ris')}>
                      RIS
                    </button>
                    <button type="button" role="menuitem" onClick={() => void runExport('markdown')}>
                      Markdown
                    </button>
                    <button type="button" role="menuitem" onClick={() => void runExport('plain')}>
                      Plain Text
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              className="generation-page__action"
              onClick={() => setDeleteOpen(true)}
            >
              Delete Draft
            </Button>
          </div>
        </div>

        {generation.status === 'failed' ? (
          <div className="generation-page__error-block">
            <p className="generation-page__error">
              {generation.error_message || 'Something went wrong.'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              Start a New Draft
            </Button>
          </div>
        ) : null}

        <section className="generation-page__section">
          <div className="generation-page__section-head">
            <h2 className="generation-page__h2">Draft</h2>
            {hasCitations ? (
              <CopyLabelButton
                label="Copy Draft"
                copied={copied === 'draft'}
                onClick={() => void copyText('draft', displayDraft)}
              />
            ) : null}
          </div>
          <pre className={`essay-output ${hasCitations ? '' : 'essay-output--muted'}`}>
            {displayDraft}
          </pre>
        </section>

        {bibliography.length ? (
          <section className="generation-page__section">
            <div className="generation-page__section-head">
              <h2 className="generation-page__h2">Bibliography</h2>
              <CopyLabelButton
                label="Copy Bibliography"
                copied={copied === 'bibliography'}
                onClick={() =>
                  void copyText('bibliography', formatBibliographyForCopy(bibliography))
                }
              />
            </div>
            <ol className="bibliography">
              {bibliography.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false)
        }}
        title="Delete Draft?"
        footer={
          <>
            <Button variant="ghost" disabled={deleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? 'Deleting…' : 'Delete Forever'}
            </Button>
          </>
        }
      >
        <p>
          This deletes the draft and its bibliography for good. There&apos;s no getting it back,
          so make sure you&apos;re ready.
        </p>
      </Dialog>
      <ProUpsellDialog
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        feature="export"
      />
    </>
  )
}
