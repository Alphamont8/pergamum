"use client"

import { useEffect, useRef, useState } from 'react'
import {
  Save,
  PanelLeftClose,
  PanelRightClose,
  PanelLeftOpen,
  PanelRightOpen,
  Undo2,
  Redo2,
} from 'lucide-react'
import type { EssayBlueprint, EssayWorkflowState, SubscriptionTier } from '../../types'
import { BlueprintHeaderBtn } from './blueprint/BlueprintHeaderBtn'
import { ResizableSplitPane } from '../ui/ResizableSplitPane'
import { FrameworkPanel } from './blueprint/FrameworkPanel'
import { InstructionsPanel } from './blueprint/InstructionsPanel'
import './blueprint/blueprint-tokens.css'
import './BlueprintTab.css'
import './blueprint/BlueprintHeaderBtn.css'
import './blueprint/FrameworkPanel.css'
import './blueprint/InstructionsPanel.css'
import './blueprint/MaterialsUpload.css'
import './blueprint/WordBudgetEditor.css'
import './blueprint/PreferenceSelect.css'
import '../ui/ResizableSplitPane.css'

type MinimizedPanel = 'instructions' | 'framework' | null

interface BlueprintTabProps {
  blueprint: EssayBlueprint
  workflow: EssayWorkflowState
  subscriptionTier: SubscriptionTier
  analyzing: boolean
  generatingOutline: boolean
  saving?: boolean
  onSaveProgress?: () => void
  onUpdate: (patch: Partial<EssayBlueprint>) => void
  onUpdateInstructions: (text: string) => void
  onAttachFile: (file: File) => void
  onRemoveAttachment: (attachmentId: string) => void
  onQuickSettingsChange: (patch: Partial<EssayBlueprint['quickSettings']>) => void
  onWordLimitChange: (patch: Partial<EssayBlueprint['wordLimit']>) => void
  onUpdateSectionWords: (sectionId: string, patch: { label?: string; weightPercent?: number }) => void
  onReorderWordBudget: (orderedIds: string[]) => void
  onRemoveWordBudgetSection: (sectionId: string) => void
  onAddWordBudgetSection: () => void
  onRebalanceWordBudget: () => void
  onGenerateFramework: () => void
  onGenerateOutline: () => void
  onUpdateOutline: () => void
  onRegenerateFrameworkField?: (field: 'title' | 'researchQuestion' | 'thesis') => void | Promise<void>
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

export function BlueprintTab({
  blueprint,
  workflow,
  subscriptionTier,
  analyzing,
  generatingOutline,
  saving,
  onSaveProgress,
  onUpdate,
  onUpdateInstructions,
  onAttachFile,
  onRemoveAttachment,
  onQuickSettingsChange,
  onWordLimitChange,
  onUpdateSectionWords,
  onReorderWordBudget,
  onRemoveWordBudgetSection,
  onAddWordBudgetSection,
  onRebalanceWordBudget,
  onGenerateFramework,
  onGenerateOutline,
  onUpdateOutline,
  onRegenerateFrameworkField,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: BlueprintTabProps) {
  const userAdjustedPanelsRef = useRef(false)
  const [minimizedPanel, setMinimizedPanel] = useState<MinimizedPanel>(() =>
    blueprint.frameworkGenerated ? null : 'framework',
  )

  useEffect(() => {
    if (userAdjustedPanelsRef.current) return
    if (blueprint.frameworkGenerated) {
      setMinimizedPanel((current) => (current === 'framework' ? null : current))
    }
  }, [blueprint.frameworkGenerated])

  const toggleMinimize = (panel: 'instructions' | 'framework') => {
    userAdjustedPanelsRef.current = true
    setMinimizedPanel((current) => (current === panel ? null : panel))
  }

  const instructionsMinimized = minimizedPanel === 'instructions'
  const frameworkMinimized = minimizedPanel === 'framework'
  const bothMinimized = instructionsMinimized && frameworkMinimized

  return (
    <div className="blueprint-tab">
      <header className="blueprint-tab__header">
        <h1 className="blueprint-tab__title">Blueprint</h1>
        <div className="blueprint-tab__toolbar">
          <BlueprintHeaderBtn
            icon={<Undo2 size={16} strokeWidth={1.75} />}
            label="Undo"
            disabled={!canUndo || !onUndo}
            onClick={onUndo}
          />
          <BlueprintHeaderBtn
            icon={<Redo2 size={16} strokeWidth={1.75} />}
            label="Redo"
            disabled={!canRedo || !onRedo}
            onClick={onRedo}
          />
          <BlueprintHeaderBtn
            icon={<Save size={16} strokeWidth={1.75} />}
            label={saving ? 'Saving…' : 'Save Progress'}
            disabled={saving || !onSaveProgress}
            onClick={onSaveProgress}
          />
          <BlueprintHeaderBtn
            icon={
              instructionsMinimized ? (
                <PanelLeftOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Instructions"
            active={instructionsMinimized}
            aria-pressed={instructionsMinimized}
            onClick={() => toggleMinimize('instructions')}
          />
          <BlueprintHeaderBtn
            icon={
              frameworkMinimized ? (
                <PanelRightOpen size={16} strokeWidth={1.75} />
              ) : (
                <PanelRightClose size={16} strokeWidth={1.75} />
              )
            }
            label="Minimize Framework"
            active={frameworkMinimized}
            aria-pressed={frameworkMinimized}
            onClick={() => toggleMinimize('framework')}
          />
        </div>
      </header>

      <div className="blueprint-tab__header-rule" aria-hidden />

      <div
        className={`blueprint-tab__body ${instructionsMinimized ? 'blueprint-tab__body--instructions-min' : ''} ${frameworkMinimized ? 'blueprint-tab__body--framework-min' : ''} ${!instructionsMinimized && !frameworkMinimized ? 'blueprint-tab__body--split' : ''}`}
      >
        {bothMinimized ? (
          <div className="blueprint-tab__empty">
            <p>Both panels are minimized. Use the toolbar above to restore Instructions or Framework.</p>
          </div>
        ) : !instructionsMinimized && !frameworkMinimized ? (
          <ResizableSplitPane
            className="blueprint-tab__split"
            left={
              <div className="blueprint-tab__pane blueprint-tab__pane--instructions">
                <InstructionsPanel
                  blueprint={blueprint}
                  subscriptionTier={subscriptionTier}
                  analyzing={analyzing}
                  onUpdateInstructions={onUpdateInstructions}
                  onAttachFile={onAttachFile}
                  onRemoveAttachment={onRemoveAttachment}
                  onQuickSettingsChange={onQuickSettingsChange}
                  onWordLimitChange={onWordLimitChange}
                  onGenerateFramework={onGenerateFramework}
                />
              </div>
            }
            right={
              <div
                className={`blueprint-tab__pane blueprint-tab__pane--framework ${blueprint.frameworkGenerated ? 'blueprint-tab__pane--framework-ready' : ''}`}
              >
                <FrameworkPanel
                  blueprint={blueprint}
                  workflow={workflow}
                  generatingOutline={generatingOutline}
                  onUpdate={onUpdate}
                  onUpdateSectionWords={onUpdateSectionWords}
                  onReorderWordBudget={onReorderWordBudget}
                  onRemoveWordBudgetSection={onRemoveWordBudgetSection}
                  onAddWordBudgetSection={onAddWordBudgetSection}
                  onRebalanceWordBudget={onRebalanceWordBudget}
                  onGenerateOutline={onGenerateOutline}
                  onUpdateOutline={onUpdateOutline}
                  onRegenerateField={onRegenerateFrameworkField}
                />
              </div>
            }
          />
        ) : (
          <>
            {!instructionsMinimized && (
              <div className="blueprint-tab__pane blueprint-tab__pane--instructions">
                <InstructionsPanel
                  blueprint={blueprint}
                  subscriptionTier={subscriptionTier}
                  analyzing={analyzing}
                  onUpdateInstructions={onUpdateInstructions}
                  onAttachFile={onAttachFile}
                  onRemoveAttachment={onRemoveAttachment}
                  onQuickSettingsChange={onQuickSettingsChange}
                  onWordLimitChange={onWordLimitChange}
                  onGenerateFramework={onGenerateFramework}
                />
              </div>
            )}

            {!frameworkMinimized && (
              <div
                className={`blueprint-tab__pane blueprint-tab__pane--framework ${blueprint.frameworkGenerated ? 'blueprint-tab__pane--framework-ready' : ''}`}
              >
                <FrameworkPanel
                  blueprint={blueprint}
                  workflow={workflow}
                  generatingOutline={generatingOutline}
                  onUpdate={onUpdate}
                  onUpdateSectionWords={onUpdateSectionWords}
                  onReorderWordBudget={onReorderWordBudget}
                  onRemoveWordBudgetSection={onRemoveWordBudgetSection}
                  onAddWordBudgetSection={onAddWordBudgetSection}
                  onRebalanceWordBudget={onRebalanceWordBudget}
                  onGenerateOutline={onGenerateOutline}
                  onUpdateOutline={onUpdateOutline}
                  onRegenerateField={onRegenerateFrameworkField}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
