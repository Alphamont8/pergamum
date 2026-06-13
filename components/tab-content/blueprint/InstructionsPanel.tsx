"use client"

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { blueprintInputFingerprint } from '@/lib/blueprint-sync'
import {
  INSTRUCTIONS_CHAR_LIMIT,
  PLAN_WORD_LIMITS,
  QUICK_SETTING_TOOLTIPS,
  buildDocumentTypeOptions,
  buildReadingLevelOptions,
  buildReferencingStyleOptions,
  buildWritingStyleOptions,
  getOptionDescription,
} from '../../../constants/blueprintSettings'
import type { EssayBlueprint, SubscriptionTier } from '../../../types'
import { MaterialsUpload } from './MaterialsUpload'
import { PreferenceSelect } from './PreferenceSelect'
import './InstructionsPanel.css'

interface InstructionsPanelProps {
  blueprint: EssayBlueprint
  subscriptionTier: SubscriptionTier
  analyzing: boolean
  onUpdateInstructions: (text: string) => void
  onAttachFile: (file: File) => void
  onRemoveAttachment: (attachmentId: string) => void
  onQuickSettingsChange: (patch: Partial<EssayBlueprint['quickSettings']>) => void
  onWordLimitChange: (patch: Partial<EssayBlueprint['wordLimit']>) => void
  onGenerateFramework: () => void
}

export function InstructionsPanel({
  blueprint,
  subscriptionTier,
  analyzing,
  onUpdateInstructions,
  onAttachFile,
  onRemoveAttachment,
  onQuickSettingsChange,
  onWordLimitChange,
  onGenerateFramework,
}: InstructionsPanelProps) {
  const planMax = PLAN_WORD_LIMITS[subscriptionTier]
  const minAuto = blueprint.wordLimit.minAuto
  const maxAuto = blueprint.wordLimit.maxAuto
  const instructionsDirty =
    blueprint.frameworkGenerated &&
    blueprint.frameworkInputFingerprint != null &&
    blueprintInputFingerprint(blueprint) !== blueprint.frameworkInputFingerprint

  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [maxDraft, setMaxDraft] = useState<string | null>(null)

  useEffect(() => {
    setMinDraft(null)
    setMaxDraft(null)
  }, [blueprint.wordLimit.min, blueprint.wordLimit.max, minAuto, maxAuto])

  const writingOptions = useMemo(
    () => buildWritingStyleOptions(subscriptionTier),
    [subscriptionTier],
  )
  const readingOptions = useMemo(
    () => buildReadingLevelOptions(subscriptionTier),
    [subscriptionTier],
  )
  const documentOptions = useMemo(
    () => buildDocumentTypeOptions(subscriptionTier),
    [subscriptionTier],
  )
  const referencingOptions = useMemo(
    () => buildReferencingStyleOptions(subscriptionTier),
    [subscriptionTier],
  )

  const writingValue = blueprint.quickSettings.writingStyleIsAuto
    ? 'Auto'
    : blueprint.quickSettings.writingStyle

  const readingValue = blueprint.quickSettings.readingLevelIsAuto
    ? 'Auto'
    : blueprint.quickSettings.readingLevel

  const documentTypeValue = blueprint.quickSettings.documentTypeIsAuto
    ? 'Auto'
    : blueprint.quickSettings.documentType

  const refValue =
    blueprint.quickSettings.referencingStyleIsAuto ||
    blueprint.quickSettings.referencingStyle === 'Auto'
      ? 'none'
      : blueprint.quickSettings.referencingStyle

  const writingHint =
    getOptionDescription(writingOptions, writingValue) ?? QUICK_SETTING_TOOLTIPS.writingStyle

  const readingHint =
    getOptionDescription(readingOptions, readingValue) ?? QUICK_SETTING_TOOLTIPS.readingLevel

  const documentHint =
    getOptionDescription(documentOptions, documentTypeValue) ??
    QUICK_SETTING_TOOLTIPS.documentType

  const referencingHint =
    getOptionDescription(referencingOptions, refValue) ??
    QUICK_SETTING_TOOLTIPS.referencingStyle

  const hasContent =
    blueprint.instructionsText.trim().length > 0 ||
    blueprint.attachments.some((a) => a.status === 'parsed')

  const canGenerate = !analyzing && hasContent
  const showOtherInput = documentTypeValue === 'Other'

  const frameworkBtnLabel = analyzing
    ? instructionsDirty
      ? 'Updating Framework…'
      : blueprint.frameworkGenerated
        ? 'Regenerating Framework…'
        : 'Generating Framework…'
    : instructionsDirty
      ? 'Update Framework'
      : blueprint.frameworkGenerated
        ? 'Regenerate Framework'
        : 'Generate Framework'

  const FrameworkIcon = instructionsDirty ? RefreshCw : Sparkles

  const minDisplay = minAuto
    ? 'Auto'
    : minDraft !== null
      ? minDraft
      : String(blueprint.wordLimit.min)

  const maxDisplay = maxAuto
    ? 'Auto'
    : maxDraft !== null
      ? maxDraft
      : String(blueprint.wordLimit.max)

  const commitMin = (raw: string) => {
    if (raw === '') {
      onWordLimitChange({ min: 0, minAuto: false })
      return
    }
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) {
      onWordLimitChange({
        min: Math.max(0, Math.min(parsed, planMax)),
        minAuto: false,
      })
    }
  }

  const commitMax = (raw: string, currentMin: number) => {
    if (raw === '') {
      onWordLimitChange({ max: 0, maxAuto: false })
      return
    }
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return

    const nextMax = Math.max(0, Math.min(parsed, planMax))
    const patch: Partial<EssayBlueprint['wordLimit']> = {
      max: nextMax,
      maxAuto: false,
    }
    if (currentMin > nextMax) {
      patch.min = nextMax
    }
    onWordLimitChange(patch)
  }

  return (
    <section className="instructions-panel" aria-label="Instructions">
      <div className="instructions-panel__scroll">
        <div className="instructions-panel__card instructions-panel__card--brief bp-card">
          <h3 className="bp-section-label">Assignment Brief</h3>
          <textarea
            className="instructions-panel__textarea bp-textarea"
            value={blueprint.instructionsText}
            maxLength={INSTRUCTIONS_CHAR_LIMIT}
            placeholder="Paste your assignment brief, question, or any instructions here…"
            onChange={(e) => onUpdateInstructions(e.target.value)}
          />
        </div>

        <div className="instructions-panel__card instructions-panel__card--materials bp-card">
          <h3 className="bp-section-label">Assignment Materials</h3>
          <MaterialsUpload
            attachments={blueprint.attachments}
            onUpload={onAttachFile}
            onRemove={onRemoveAttachment}
          />
        </div>

        <div className="instructions-panel__card bp-card">
          <h3 className="bp-section-label">Preferences</h3>
          <div className="instructions-panel__preferences-list">
            <PreferenceSelect
              label="Writing Style"
              hint={writingHint}
              value={writingValue}
              options={writingOptions}
              onChange={(v) =>
                onQuickSettingsChange({
                  writingStyle: v,
                  writingStyleIsAuto: v === 'Auto',
                })
              }
            />
            <PreferenceSelect
              label="Reading Level"
              hint={readingHint}
              value={readingValue}
              options={readingOptions}
              onChange={(v) =>
                onQuickSettingsChange({
                  readingLevel: v,
                  readingLevelIsAuto: v === 'Auto',
                })
              }
            />
            <PreferenceSelect
              label="Document Type"
              hint={documentHint}
              value={documentTypeValue}
              options={documentOptions}
              onChange={(v) =>
                onQuickSettingsChange({
                  documentType: v,
                  documentTypeIsAuto: v === 'Auto',
                  ...(v !== 'Other' ? { documentTypeCustom: undefined } : {}),
                })
              }
              afterTrigger={
                showOtherInput ? (
                  <input
                    type="text"
                    className="bp-input instructions-panel__other-type-input"
                    placeholder="Insert your custom document format…"
                    value={blueprint.quickSettings.documentTypeCustom ?? ''}
                    onChange={(e) =>
                      onQuickSettingsChange({ documentTypeCustom: e.target.value })
                    }
                  />
                ) : undefined
              }
            />
            <PreferenceSelect
              label="Referencing Style"
              hint={referencingHint}
              value={refValue}
              options={referencingOptions}
              onChange={(v) =>
                onQuickSettingsChange({
                  referencingStyle: v as EssayBlueprint['quickSettings']['referencingStyle'],
                  referencingStyleIsAuto: false,
                })
              }
            />
          </div>
        </div>

        <div className="instructions-panel__card bp-card">
          <div className="instructions-panel__word-limit-header">
            <h3 className="bp-section-label">Total Word Limit</h3>
            <span className="instructions-panel__plan-cap">
              {subscriptionTier} Plan Word Cap: {planMax.toLocaleString()}
            </span>
          </div>
          <p className="instructions-panel__word-hint bp-hint">{QUICK_SETTING_TOOLTIPS.wordLimit}</p>
          <div className="instructions-panel__word-row">
            <div className="instructions-panel__word-boundary">
              <label className="instructions-panel__word-field">
                <span className="bp-field-label">Lower</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`bp-input ${minAuto ? 'instructions-panel__word-input--auto' : ''}`}
                  disabled={minAuto}
                  readOnly={minAuto}
                  value={minDisplay}
                  onChange={(e) => {
                    if (minAuto) return
                    const raw = e.target.value
                    if (raw !== '' && !/^\d+$/.test(raw)) return
                    setMinDraft(raw)
                  }}
                  onBlur={() => {
                    if (minAuto) return
                    if (minDraft !== null) commitMin(minDraft === '' ? '' : minDraft)
                    setMinDraft(null)
                  }}
                />
              </label>
              <button
                type="button"
                className={`instructions-panel__auto-btn ${minAuto ? 'instructions-panel__auto-btn--on' : ''}`}
                aria-pressed={minAuto}
                title="Auto lower boundary"
                onClick={() => {
                  if (minAuto) {
                    onWordLimitChange({
                      minAuto: false,
                      min: Math.round(planMax * 0.9),
                    })
                  } else {
                    onWordLimitChange({ minAuto: true })
                  }
                }}
              >
                Auto
              </button>
            </div>
            <div className="instructions-panel__word-boundary">
              <label className="instructions-panel__word-field">
                <span className="bp-field-label">Upper</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={`bp-input ${maxAuto ? 'instructions-panel__word-input--auto' : ''}`}
                  disabled={maxAuto}
                  readOnly={maxAuto}
                  value={maxDisplay}
                  onChange={(e) => {
                    if (maxAuto) return
                    const raw = e.target.value
                    if (raw !== '' && !/^\d+$/.test(raw)) return
                    setMaxDraft(raw)
                  }}
                  onBlur={() => {
                    if (maxAuto) return
                    if (maxDraft !== null) {
                      commitMax(maxDraft === '' ? '' : maxDraft, blueprint.wordLimit.min)
                    }
                    setMaxDraft(null)
                  }}
                />
              </label>
              <button
                type="button"
                className={`instructions-panel__auto-btn ${maxAuto ? 'instructions-panel__auto-btn--on' : ''}`}
                aria-pressed={maxAuto}
                title="Auto upper boundary"
                onClick={() => {
                  if (maxAuto) {
                    onWordLimitChange({ maxAuto: false, max: planMax })
                  } else {
                    onWordLimitChange({ maxAuto: true })
                  }
                }}
              >
                Auto
              </button>
            </div>
          </div>
        </div>
      </div>

      <footer className="instructions-panel__footer">
        <button
          type="button"
          className="bp-btn-primary"
          disabled={!canGenerate}
          onClick={onGenerateFramework}
        >
          <FrameworkIcon size={16} strokeWidth={1.75} aria-hidden />
          {frameworkBtnLabel}
        </button>
      </footer>
    </section>
  )
}
