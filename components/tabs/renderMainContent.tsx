"use client"

import type { AppNavId } from '../../constants/navigation'
import { navToTabKind } from '../../constants/navigation'
import { BlueprintTab } from '../tab-content/BlueprintTab'
import { DraftTab } from '../tab-content/DraftTab'
import { ExportTab } from '../tab-content/ExportTab'
import { HelpPage } from '../tab-content/HelpPage'
import { HomePage } from '../tab-content/HomePage'
import { LeaderboardPage } from '../tab-content/LeaderboardPage'
import { ProjectsPage } from '../tab-content/ProjectsPage'
import { SettingsPage } from '../tab-content/SettingsPage'
import { renderTabContent } from './renderTabContent'
import type { RenderTabContentOptions } from './tabContentProps'

type MainContentOptions = Omit<RenderTabContentOptions, 'kind'> & {
  activeNavId: AppNavId
}

export function renderMainContent({
  activeNavId,
  essay,
  ...rest
}: MainContentOptions) {
  if (activeNavId === 'home') {
    return <HomePage />
  }
  if (activeNavId === 'projects') {
    return <ProjectsPage />
  }
  if (activeNavId === 'leaderboard') {
    return <LeaderboardPage />
  }
  if (activeNavId === 'settings') {
    return <SettingsPage />
  }
  if (activeNavId === 'help') {
    return <HelpPage />
  }

  const tabKind = navToTabKind(activeNavId)
  if (!tabKind) return null

  if (tabKind === 'blueprint') {
    return (
      <BlueprintTab
        blueprint={essay.blueprint}
        workflow={rest.workflow}
        subscriptionTier={rest.subscriptionTier}
        analyzing={rest.analyzing}
        generatingOutline={rest.generatingOutline}
        saving={rest.saving}
        onSaveProgress={rest.actions.saveProgress}
        onUpdate={rest.actions.updateBlueprint}
        onUpdateInstructions={rest.actions.updateInstructionsText}
        onAttachFile={rest.actions.attachInstructionFile}
        onRemoveAttachment={rest.actions.removeInstructionAttachment}
        onQuickSettingsChange={rest.actions.updateQuickSettings}
        onWordLimitChange={rest.actions.updateWordLimit}
        onUpdateSectionWords={rest.actions.updateWordBudgetSection}
        onReorderWordBudget={rest.actions.reorderWordBudgetSections}
        onRemoveWordBudgetSection={rest.actions.removeWordBudgetSection}
        onAddWordBudgetSection={rest.actions.addWordBudgetSection}
        onRebalanceWordBudget={rest.actions.rebalanceWordBudget}
        onGenerateFramework={rest.actions.generateFramework}
        onRegenerateFrameworkField={rest.actions.regenerateFrameworkField}
        onGenerateOutline={rest.actions.generateOutline}
        onUpdateOutline={rest.actions.updateOutline}
        onUndo={rest.actions.undo}
        onRedo={rest.actions.redo}
        canUndo={rest.actions.canUndo}
        canRedo={rest.actions.canRedo}
      />
    )
  }

  if (tabKind === 'draft') {
    return (
      <DraftTab
        draft={essay.draft}
        blueprint={essay.blueprint}
        outline={essay.outline.nodes}
        sources={essay.sources}
        workflow={rest.workflow}
        subscriptionTier={rest.subscriptionTier}
        saving={rest.saving}
        generatingDraft={rest.actions.generatingFullDraft}
        activeSectionId={essay.draft.activeSectionId}
        hasTextSelection={Boolean(essay.workspaceContext.selectedTextRange?.text?.trim())}
        selectedText={essay.workspaceContext.selectedTextRange?.text?.trim() || null}
        activeSelectionTool={essay.workspaceContext.activeSelectionTool}
        toolScopes={rest.actions.draftToolScopes}
        highlightedSuggestionId={rest.actions.highlightedSuggestionId}
        onSaveProgress={rest.actions.saveProgress}
        onUndo={rest.actions.undo}
        onRedo={rest.actions.redo}
        canUndo={rest.actions.canUndo}
        canRedo={rest.actions.canRedo}
        onUpdateUnified={rest.actions.updateUnifiedDraft}
        onInsertCitation={rest.actions.insertCitationAt}
        onRunTool={rest.actions.runDraftTool}
        onRunAllTools={rest.actions.runAllDraftTools}
        onActiveSelectionToolChange={rest.actions.setActiveSelectionTool}
        onClearMultipurposeResults={rest.actions.clearMultipurposeToolResults}
        onScopeChange={rest.actions.setDraftToolScope}
        onAcceptSuggestion={rest.actions.acceptDraftSuggestion}
        onDismissSuggestion={rest.actions.dismissDraftSuggestion}
        onReplaceSuggestion={rest.actions.replaceDraftSuggestion}
        onScrollToSuggestion={(id) => {
          rest.actions.highlightDraftSuggestion(id)
          let sectionId: string | null = null
          for (const state of Object.values(essay.draft.tools ?? {})) {
            const found = state?.results.find((s) => s.id === id)
            if (found) {
              sectionId = found.sectionId
              break
            }
          }
          if (sectionId) {
            document
              .querySelector(`h2[data-section-id="${sectionId}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          requestAnimationFrame(() => {
            document
              .querySelector(`[data-suggestion-id="${id}"]`)
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          })
        }}
        onHighlightSuggestion={rest.actions.highlightDraftSuggestion}
        onInsertSourceSuggestion={rest.actions.insertSourceFromSuggestion}
        onAcceptAllTool={rest.actions.acceptAllDraftTool}
        onDismissAllTool={rest.actions.dismissAllDraftTool}
        onSelectionChange={(sectionId, start, end, text) =>
          rest.actions.setTextSelection(
            text.trim() ? { sectionId, start, end, text } : null,
          )
        }
        onSuggestionClick={rest.actions.highlightDraftSuggestion}
      />
    )
  }

  if (tabKind === 'export') {
    return (
      <ExportTab
        workflow={rest.workflow}
        blueprint={essay.blueprint}
        sources={essay.sources}
        citations={essay.citations}
        outlineNodes={essay.outline.nodes}
        draftSections={essay.draft.sections}
      />
    )
  }

  return renderTabContent({
    kind: tabKind,
    essay,
    subscriptionTier: rest.subscriptionTier,
    workflow: rest.workflow,
    analyzing: rest.analyzing,
    generatingOutline: rest.generatingOutline,
    saving: rest.saving,
    actions: rest.actions,
  })
}
