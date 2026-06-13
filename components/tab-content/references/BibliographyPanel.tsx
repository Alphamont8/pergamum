'use client'

import { useMemo } from 'react'
import { AlertTriangle, Copy } from 'lucide-react'
import { PreferenceSelect } from '../blueprint/PreferenceSelect'
import { buildReferencingStyleOptions } from '@/constants/preferenceOptions'
import type {
  BibliographyEntry,
  EssayBlueprint,
  ReferencingStyleId,
  SubscriptionTier,
} from '@/types'
import type { BibliographyHygieneWarning } from '@/lib/citations'
import { BibliographyEntryRow } from './BibliographyEntry'
import '../blueprint/PreferenceSelect.css'
import './BibliographyPanel.css'

interface BibliographyStats {
  totalSources: number
  citedCount: number
  outlineOnlyCount: number
  unusedCount: number
  avgReliability: number | null
  lowReliabilityCited: number
}

interface BibliographyPanelProps {
  blueprint: EssayBlueprint
  subscriptionTier: SubscriptionTier
  entries: BibliographyEntry[]
  stats: BibliographyStats
  warnings: BibliographyHygieneWarning[]
  loading: boolean
  selectedSourceId: string | null
  onSetReferencingStyle: (id: ReferencingStyleId) => void
  onSelectSource: (sourceId: string) => void
}

const GROUP_LABELS = {
  cited: 'Cited in Draft',
  outline: 'Stored in Outline',
  unused: 'Unused Sources',
} as const

function formatEntryForCopy(entry: BibliographyEntry): string {
  if (entry.citationNumber != null) {
    return `[${entry.citationNumber}] ${entry.formatted}`
  }
  return entry.formatted
}

export function BibliographyPanel({
  blueprint,
  subscriptionTier,
  entries,
  stats,
  warnings,
  loading,
  selectedSourceId,
  onSetReferencingStyle,
  onSelectSource,
}: BibliographyPanelProps) {
  const styleId = blueprint.referencingStyleId
  const styleOptions = buildReferencingStyleOptions(subscriptionTier)

  const grouped = useMemo(() => {
    const map = new Map<string, BibliographyEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.group) ?? []
      list.push(entry)
      map.set(entry.group, list)
    }
    return map
  }, [entries])

  const handleCopyAll = async (list: BibliographyEntry[]) => {
    const text = list.map(formatEntryForCopy).join('\n\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  if (styleId === 'none') {
    return (
      <div className="bib-panel">
        <div className="bib-panel__style-box">
          <p className="bib-panel__style-desc">
            Choose a referencing style to enable citations and your bibliography.
          </p>
          <PreferenceSelect
            label="Referencing Style"
            value="none"
            options={styleOptions}
            span="full"
            onChange={(v) => onSetReferencingStyle(v as ReferencingStyleId)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="bib-panel">
      <div className="bib-panel__style-box">
        <PreferenceSelect
          label="Referencing Style"
          value={styleId}
          options={styleOptions}
          span="full"
          onChange={(v) => onSetReferencingStyle(v as ReferencingStyleId)}
        />
        {warnings.length > 0 && (
          <div className="bib-panel__chips">
            {warnings.slice(0, 3).map((w) => (
              <span key={w.id} className="bib-panel__chip bib-panel__chip--warn">
                <AlertTriangle size={11} />
                {w.message}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bib-panel__stats" aria-label="Bibliography coverage">
        <span className="bib-panel__stat">
          Sources: <strong>{stats.totalSources}</strong>
        </span>
        <span className="bib-panel__stat">
          Cited: <strong>{stats.citedCount}</strong>
        </span>
        {stats.avgReliability != null && (
          <span className="bib-panel__stat">
            Average Reliability: <strong>{stats.avgReliability}</strong>
          </span>
        )}
        {stats.lowReliabilityCited > 0 && (
          <span className="bib-panel__stat bib-panel__stat--warn">
            <AlertTriangle size={11} />
            Low Score Cited: <strong>{stats.lowReliabilityCited}</strong>
          </span>
        )}
      </div>

      {loading && <p className="bib-panel__loading">Updating bibliography…</p>}

      {!loading && entries.length === 0 && (
        <div className="bib-panel__empty">
          <p>Your bibliography will appear here once you add sources in Outline and cite them in Draft.</p>
        </div>
      )}

      {(['cited', 'outline', 'unused'] as const).map((group) => {
        const list = grouped.get(group) ?? []
        if (list.length === 0) return null
        const isCited = group === 'cited'
        return (
          <section key={group} className="bib-panel__section-box">
            <div className="bib-panel__section-header">
              <h3 className="bp-section-label bib-panel__section-title">
                {GROUP_LABELS[group]}
              </h3>
              {isCited && (
                <button
                  type="button"
                  className="bib-panel__copy-all"
                  title="Copy all cited references"
                  onClick={() => handleCopyAll(list)}
                >
                  <Copy size={13} strokeWidth={1.75} />
                  Copy All
                </button>
              )}
            </div>
            <div className="bib-panel__list">
              {list.map((entry) => (
                <BibliographyEntryRow
                  key={entry.sourceId}
                  entry={entry}
                  selected={selectedSourceId === entry.sourceId}
                  onSelect={() => onSelectSource(entry.sourceId)}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
