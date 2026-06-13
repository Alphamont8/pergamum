"use client"

import { BlueprintTab } from '../tab-content/BlueprintTab'
import { DraftTab } from '../tab-content/DraftTab'
import { OutlineTab } from '../tab-content/OutlineTab'
import { ReferencesTab } from '../tab-content/ReferencesTab'
import type { TabKind } from '../../types'
import type { RenderTabContentOptions } from './tabContentProps'

export function renderTabContent({
  kind,
  essay,
  subscriptionTier,
  workflow,
  analyzing,
  generatingOutline,
  saving,
  actions,
}: RenderTabContentOptions) {
  switch (kind) {
    case 'blueprint':
      return (
        <BlueprintTab
          blueprint={essay.blueprint}
          workflow={workflow}
          subscriptionTier={subscriptionTier}
          analyzing={analyzing}
          generatingOutline={generatingOutline}
          saving={saving}
          onSaveProgress={actions.saveProgress}
          onUpdate={actions.updateBlueprint}
          onUpdateInstructions={actions.updateInstructionsText}
          onAttachFile={actions.attachInstructionFile}
          onRemoveAttachment={actions.removeInstructionAttachment}
          onQuickSettingsChange={actions.updateQuickSettings}
          onWordLimitChange={actions.updateWordLimit}
          onUpdateSectionWords={actions.updateWordBudgetSection}
          onReorderWordBudget={actions.reorderWordBudgetSections}
          onRemoveWordBudgetSection={actions.removeWordBudgetSection}
          onAddWordBudgetSection={actions.addWordBudgetSection}
          onRebalanceWordBudget={actions.rebalanceWordBudget}
          onGenerateFramework={actions.generateFramework}
          onRegenerateFrameworkField={actions.regenerateFrameworkField}
          onGenerateOutline={actions.generateOutline}
          onUpdateOutline={actions.updateOutline}
          onUndo={actions.undo}
          onRedo={actions.redo}
          canUndo={actions.canUndo}
          canRedo={actions.canRedo}
        />
      )
    case 'outline':
      return (
        <OutlineTab
          nodes={essay.outline.nodes}
          sources={essay.sources}
          blueprint={essay.blueprint}
          workflow={workflow}
          selectedNodeId={essay.workspaceContext.selectedOutlineNodeId}
          selectedSourceId={essay.workspaceContext.selectedSourceId}
          saving={saving}
          onSaveProgress={actions.saveProgress}
          onSelectNode={actions.selectOutlineNode}
          onSelectSource={actions.selectSource}
          onToggleCollapse={actions.toggleOutlineCollapse}
          onExpandAll={actions.expandAllOutline}
          onCollapseAll={actions.collapseAllOutline}
          onUpdateNode={actions.updateOutlineNode}
          onAddNode={actions.addOutlineNode}
          onRemoveNode={actions.removeOutlineNode}
          onConvertNodeType={actions.convertOutlineNodeType}
          onMoveNode={actions.moveOutlineNode}
          onAttachSource={actions.attachSourceToNode}
          onDetachSource={actions.detachSourceFromNode}
          onUpdateSource={actions.updateSource}
          onUpdateSourceQuote={actions.updateSourceRefQuote}
          onUpdateSourceQuotes={actions.updateSourceRefQuotes}
          onSearchSources={actions.searchSources}
          onResearchNode={actions.searchOutlineNodeStub}
          onAddFoundSource={actions.addFoundSourceToNode}
          onUploadSource={actions.uploadSourceStub}
          draftEverGenerated={workflow.draftEverGenerated}
          generatingDraft={actions.generatingFullDraft}
          onGenerateDraft={actions.generateDraftFromOutline}
          onUndo={actions.undo}
          onRedo={actions.redo}
          canUndo={actions.canUndo}
          canRedo={actions.canRedo}
        />
      )
    case 'draft':
      return (
        <DraftTab
          draft={essay.draft}
          blueprint={essay.blueprint}
          outline={essay.outline.nodes}
          sources={essay.sources}
          workflow={workflow}
          subscriptionTier={subscriptionTier}
          saving={saving}
          generatingDraft={actions.generatingFullDraft}
          activeSectionId={essay.draft.activeSectionId}
          hasTextSelection={Boolean(essay.workspaceContext.selectedTextRange?.text?.trim())}
          selectedText={essay.workspaceContext.selectedTextRange?.text?.trim() || null}
          activeSelectionTool={essay.workspaceContext.activeSelectionTool}
          toolScopes={actions.draftToolScopes}
          highlightedSuggestionId={actions.highlightedSuggestionId}
          onSaveProgress={actions.saveProgress}
          onUndo={actions.undo}
          onRedo={actions.redo}
          canUndo={actions.canUndo}
          canRedo={actions.canRedo}
          onUpdateUnified={actions.updateUnifiedDraft}
          onInsertCitation={actions.insertCitationAt}
          onRunTool={actions.runDraftTool}
          onRunAllTools={actions.runAllDraftTools}
          onActiveSelectionToolChange={actions.setActiveSelectionTool}
          onClearMultipurposeResults={actions.clearMultipurposeToolResults}
          onScopeChange={actions.setDraftToolScope}
          onAcceptSuggestion={actions.acceptDraftSuggestion}
          onDismissSuggestion={actions.dismissDraftSuggestion}
          onReplaceSuggestion={actions.replaceDraftSuggestion}
          onScrollToSuggestion={(id) => {
            actions.highlightDraftSuggestion(id)
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
          onHighlightSuggestion={actions.highlightDraftSuggestion}
          onInsertSourceSuggestion={actions.insertSourceFromSuggestion}
          onAcceptAllTool={actions.acceptAllDraftTool}
          onDismissAllTool={actions.dismissAllDraftTool}
          onSelectionChange={(sectionId, start, end, text) =>
            actions.setTextSelection(
              text.trim() ? { sectionId, start, end, text } : null,
            )
          }
          onSuggestionClick={actions.highlightDraftSuggestion}
        />
      )
    case 'references':
      return (
        <ReferencesTab
          blueprint={essay.blueprint}
          sources={essay.sources}
          citations={essay.citations}
          outlineNodes={essay.outline.nodes}
          draftSections={essay.draft.sections}
          subscriptionTier={subscriptionTier}
          selectedSourceId={essay.workspaceContext.selectedSourceId}
          saving={saving}
          enrichingIds={actions.enrichingIds}
          evaluatingIds={actions.evaluatingIds}
          bulkEnriching={actions.bulkEnriching}
          bulkEvaluating={actions.bulkEvaluating}
          onSaveProgress={actions.saveProgress}
          onUndo={actions.undo}
          onRedo={actions.redo}
          canUndo={actions.canUndo}
          canRedo={actions.canRedo}
          onSetReferencingStyle={actions.setReferencingStyle}
          onReconcileCitations={actions.reconcileCitations}
          onSelectSource={actions.selectSource}
          onUpdateSource={actions.updateSource}
          onEnrichSource={actions.enrichSource}
          onEvaluateSource={actions.evaluateSource}
          onEnrichAll={actions.enrichAllSources}
          onEvaluateAll={actions.evaluateAllSources}
          onRemoveSource={actions.removeSource}
        />
      )
    default:
      return null
  }
}

export type { TabKind }
