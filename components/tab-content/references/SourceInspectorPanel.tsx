'use client'

import { useMemo, useState } from 'react'
import { RefreshCw, Search, Shield } from 'lucide-react'
import type { BibliographyEntry, BibliographyGroup, OutlineNode, ReferencingStyleId, SourceRecord } from '@/types'
import { PreferenceSelect } from '../blueprint/PreferenceSelect'
import type { PreferenceSelectOption } from '@/constants/preferenceOptions'
import { SourceLibraryCard } from './SourceLibraryCard'
import { SourceDetailCard } from './SourceDetailCard'
import '../blueprint/PreferenceSelect.css'
import './SourceInspectorPanel.css'

type SortKey = 'title' | 'reliability' | 'year' | 'cited'
type FilterKey = 'all' | BibliographyGroup

const FILTER_OPTIONS: PreferenceSelectOption[] = [
  { value: 'all', label: 'All' },
  { value: 'cited', label: 'Cited' },
  { value: 'outline', label: 'Outline Only' },
  { value: 'unused', label: 'Unused' },
]

const SORT_OPTIONS: PreferenceSelectOption[] = [
  { value: 'title', label: 'Title' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'year', label: 'Year' },
  { value: 'cited', label: 'Citations' },
]

interface SourceInspectorPanelProps {
  sources: SourceRecord[]
  groups: Map<string, BibliographyGroup>
  entries: BibliographyEntry[]
  outlineNodes: OutlineNode[]
  styleId: ReferencingStyleId
  selectedSourceId: string | null
  enrichingIds: Set<string>
  evaluatingIds: Set<string>
  bulkEnriching?: boolean
  bulkEvaluating?: boolean
  onSelectSource: (sourceId: string | null) => void
  onUpdateSource: (sourceId: string, patch: Partial<SourceRecord>) => void
  onEnrichSource: (sourceId: string) => void
  onEvaluateSource: (sourceId: string) => void
  onEnrichAll: () => void
  onEvaluateAll: () => void
  onRemoveSource?: (sourceId: string) => void
}

export function SourceInspectorPanel({
  sources,
  groups,
  entries,
  outlineNodes,
  styleId,
  selectedSourceId,
  enrichingIds,
  evaluatingIds,
  bulkEnriching,
  bulkEvaluating,
  onSelectSource,
  onUpdateSource,
  onEnrichSource,
  onEvaluateSource,
  onEnrichAll,
  onEvaluateAll,
  onRemoveSource,
}: SourceInspectorPanelProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('title')

  const selectedSource = sources.find((s) => s.id === selectedSourceId)
  const selectedEntry = entries.find((e) => e.sourceId === selectedSourceId)

  const filtered = useMemo(() => {
    let list = [...sources]
    if (filter !== 'all') {
      list = list.filter((s) => groups.get(s.id) === filter)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.authors?.toLowerCase().includes(q) ||
          s.venue?.name?.toLowerCase().includes(q),
      )
    }
    list.sort((a, b) => {
      if (sort === 'reliability') {
        return (b.reliability?.overall ?? 0) - (a.reliability?.overall ?? 0)
      }
      if (sort === 'year') {
        return (b.year ?? '').localeCompare(a.year ?? '')
      }
      if (sort === 'cited') {
        const ea = entries.find((e) => e.sourceId === a.id)?.citationCount ?? 0
        const eb = entries.find((e) => e.sourceId === b.id)?.citationCount ?? 0
        return eb - ea
      }
      return a.title.localeCompare(b.title)
    })
    return list
  }, [sources, groups, query, filter, sort, entries])

  if (selectedSource) {
    return (
      <SourceDetailCard
        source={selectedSource}
        bibliographyEntry={selectedEntry}
        outlineNodes={outlineNodes}
        styleId={styleId}
        enriching={enrichingIds.has(selectedSource.id)}
        evaluating={evaluatingIds.has(selectedSource.id)}
        onBack={() => onSelectSource(null)}
        onUpdateSource={(patch) => onUpdateSource(selectedSource.id, patch)}
        onEnrich={() => onEnrichSource(selectedSource.id)}
        onEvaluate={() => onEvaluateSource(selectedSource.id)}
        onRemove={onRemoveSource ? () => onRemoveSource(selectedSource.id) : undefined}
      />
    )
  }

  return (
    <div className="source-inspector">
      <div className="source-inspector__search">
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          placeholder="Search sources…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="source-inspector__controls-box">
        <div className="source-inspector__controls-row">
          <PreferenceSelect
            label="Filter"
            value={filter}
            options={FILTER_OPTIONS}
            span="full"
            onChange={(v) => setFilter(v as FilterKey)}
          />
          <PreferenceSelect
            label="Sort"
            value={sort}
            options={SORT_OPTIONS}
            span="full"
            onChange={(v) => setSort(v as SortKey)}
          />
        </div>
        <div className="source-inspector__bulk">
          <button
            type="button"
            className="bp-btn-secondary"
            disabled={bulkEnriching || sources.length === 0}
            onClick={onEnrichAll}
          >
            <RefreshCw size={14} />
            {bulkEnriching ? 'Updating All…' : 'Update All'}
          </button>
          <button
            type="button"
            className="bp-btn-secondary"
            disabled={bulkEvaluating || sources.length === 0}
            onClick={onEvaluateAll}
          >
            <Shield size={14} />
            {bulkEvaluating ? 'Evaluating All…' : 'Evaluate All'}
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="source-inspector__empty">
          <p>No sources yet. Add research in the Outline tab to build your bibliography.</p>
        </div>
      ) : (
        <div className="source-inspector__list">
          {filtered.map((source) => {
            const entry = entries.find((e) => e.sourceId === source.id)
            return (
              <SourceLibraryCard
                key={source.id}
                source={source}
                group={groups.get(source.id)}
                citedCount={entry?.citationCount}
                onClick={() => onSelectSource(source.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
