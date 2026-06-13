"use client"

import { useState } from 'react'
import { ListTree, RefreshCw, Sparkles } from 'lucide-react'
import type { EssayBlueprint, EssayWorkflowState } from '../../../types'
import { WordBudgetEditor } from './WordBudgetEditor'
import './FrameworkPanel.css'

type FrameworkField = 'title' | 'researchQuestion' | 'thesis'

interface FrameworkPanelProps {
  blueprint: EssayBlueprint
  workflow: EssayWorkflowState
  generatingOutline: boolean
  onUpdate: (patch: Partial<EssayBlueprint>) => void
  onUpdateSectionWords: (sectionId: string, patch: { label?: string; weightPercent?: number }) => void
  onReorderWordBudget: (orderedIds: string[]) => void
  onRemoveWordBudgetSection: (sectionId: string) => void
  onAddWordBudgetSection: () => void
  onRebalanceWordBudget: () => void
  onGenerateOutline: () => void
  onUpdateOutline: () => void
  onRegenerateField?: (field: FrameworkField) => void | Promise<void>
}

function RegenerateFieldBtn({
  field,
  regenerating,
  onRegenerate,
}: {
  field: FrameworkField
  regenerating: boolean
  onRegenerate?: (field: FrameworkField) => void | Promise<void>
}) {
  if (!onRegenerate) return null
  return (
    <button
      type="button"
      className="framework-panel__regen-btn"
      title={`Regenerate ${field === 'researchQuestion' ? 'research question' : field}`}
      aria-label={`Regenerate ${field === 'researchQuestion' ? 'research question' : field}`}
      disabled={regenerating}
      onClick={() => onRegenerate(field)}
    >
      <RefreshCw size={14} strokeWidth={1.75} className={regenerating ? 'framework-panel__regen-icon--spin' : ''} />
    </button>
  )
}

export function FrameworkPanel({
  blueprint,
  workflow,
  generatingOutline,
  onUpdate,
  onUpdateSectionWords,
  onReorderWordBudget,
  onRemoveWordBudgetSection,
  onAddWordBudgetSection,
  onRebalanceWordBudget,
  onGenerateOutline,
  onUpdateOutline,
  onRegenerateField,
}: FrameworkPanelProps) {
  const [regeneratingField, setRegeneratingField] = useState<FrameworkField | null>(null)

  const handleRegenerate = async (field: FrameworkField) => {
    if (!onRegenerateField || regeneratingField) return
    setRegeneratingField(field)
    try {
      await onRegenerateField(field)
    } finally {
      setRegeneratingField(null)
    }
  }

  if (!blueprint.frameworkGenerated || !blueprint.analysis) {
    return (
      <section className="framework-panel framework-panel--empty" aria-label="Framework">
        <div className="framework-panel__placeholder">
          <div className="framework-panel__placeholder-icon" aria-hidden>
            <ListTree size={28} strokeWidth={1.5} />
          </div>
          <h3 className="framework-panel__placeholder-title">Framework</h3>
          <p className="framework-panel__placeholder-text">
            Generate a framework from your instructions to see title, thesis, section word targets,
            and rubric alignment here.
          </p>
        </div>
      </section>
    )
  }

  const outlineApproved = workflow.blueprintApproved
  const canGenerateOutline =
    !generatingOutline &&
    blueprint.title.trim().length > 0 &&
    blueprint.thesis.trim().length > 0

  const footerLabel = generatingOutline
    ? outlineApproved
      ? 'Updating Outline…'
      : 'Generating Outline…'
    : outlineApproved
      ? 'Update Outline'
      : 'Generate Outline'

  const FooterIcon = outlineApproved ? RefreshCw : Sparkles

  return (
    <section className="framework-panel" aria-label="Framework">
      <div className="framework-panel__scroll">
        <div className="framework-panel__card bp-card">
          <h4 className="framework-panel__subheading">Proposal</h4>
          <label className="framework-panel__field">
            <span className="framework-panel__field-header">
              <span className="bp-field-label">Title</span>
              <RegenerateFieldBtn
                field="title"
                regenerating={regeneratingField === 'title'}
                onRegenerate={handleRegenerate}
              />
            </span>
            <input
              type="text"
              className="bp-input"
              value={blueprint.title}
              onChange={(e) => onUpdate({ title: e.target.value })}
            />
          </label>
          <label className="framework-panel__field">
            <span className="framework-panel__field-header">
              <span className="bp-field-label">Research Question</span>
              <RegenerateFieldBtn
                field="researchQuestion"
                regenerating={regeneratingField === 'researchQuestion'}
                onRegenerate={handleRegenerate}
              />
            </span>
            <textarea
              className="bp-textarea framework-panel__textarea--two"
              rows={2}
              value={blueprint.researchQuestion}
              onChange={(e) => onUpdate({ researchQuestion: e.target.value })}
            />
          </label>
          <label className="framework-panel__field">
            <span className="framework-panel__field-header">
              <span className="bp-field-label">Thesis</span>
              <RegenerateFieldBtn
                field="thesis"
                regenerating={regeneratingField === 'thesis'}
                onRegenerate={handleRegenerate}
              />
            </span>
            <textarea
              className="bp-textarea framework-panel__textarea--three"
              rows={3}
              value={blueprint.thesis}
              onChange={(e) => onUpdate({ thesis: e.target.value })}
            />
          </label>
        </div>

        <div className="framework-panel__card bp-card">
          <WordBudgetEditor
            wordBudget={blueprint.wordBudget}
            targetTotal={blueprint.wordLimit.max}
            locked={false}
            onUpdateSection={onUpdateSectionWords}
            onReorder={onReorderWordBudget}
            onRemove={onRemoveWordBudgetSection}
            onAdd={onAddWordBudgetSection}
            onRebalance={onRebalanceWordBudget}
          />
        </div>

      </div>

      <footer className="framework-panel__footer">
        <button
          type="button"
          className="bp-btn-primary"
          disabled={!canGenerateOutline}
          onClick={outlineApproved ? onUpdateOutline : onGenerateOutline}
        >
          <FooterIcon size={16} strokeWidth={1.75} aria-hidden />
          {footerLabel}
        </button>
      </footer>
    </section>
  )
}
