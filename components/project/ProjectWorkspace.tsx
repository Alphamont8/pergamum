"use client"

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { pathToNavId, navIdToPath, isGuestPath } from '@/constants/routes'
import type { AppNavId } from '@/constants/navigation'
import { useWorkspace } from '@/hooks/useWorkspace'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { MainWorkspace } from '@/components/layout/MainWorkspace'
import type { EssayTabActions } from '@/components/tabs/tabContentProps'
import { SELECTABLE_PLANS } from '@/constants/preferenceOptions'
import type { EssayState, SubscriptionTier } from '@/types'
import '@/styles/app-shell.css'

interface ProjectWorkspaceProps {
  projectId: string
  projectTitle: string
  initialEssay: EssayState
  subscriptionTier: SubscriptionTier
  isGuest?: boolean
}

export function ProjectWorkspace({
  projectId,
  initialEssay,
  subscriptionTier,
  isGuest: isGuestProp,
}: ProjectWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const isGuest = isGuestProp ?? isGuestPath(pathname)
  const activeNavId = (pathToNavId(pathname) ?? 'blueprint') as AppNavId

  const defaultPlan: SubscriptionTier = isGuest
    ? 'Pro'
    : subscriptionTier === 'Max'
      ? 'Pro'
      : SELECTABLE_PLANS.includes(subscriptionTier as (typeof SELECTABLE_PLANS)[number])
        ? subscriptionTier
        : 'Plus'

  const [activePlan, setActivePlan] = useState<SubscriptionTier>(defaultPlan)

  const onNavigate = useCallback(
    (navId: AppNavId) => {
      if (navId === 'home') {
        router.push('/home')
        return
      }
      if (navId === 'projects') {
        router.push(isGuest ? '/guest' : '/projects')
        return
      }
      if (navId === 'leaderboard') {
        router.push('/leaderboard')
        return
      }
      if (navId === 'settings') {
        router.push(isGuest ? '/login' : '/settings')
        return
      }
      if (navId === 'help') {
        router.push('/help')
        return
      }
      router.push(navIdToPath(projectId, navId, isGuest))
    },
    [router, isGuest, projectId],
  )

  const ws = useWorkspace({
    projectId,
    initialEssay,
    subscriptionTier: activePlan,
    activeNavId,
    onNavigate,
    guestMode: isGuest,
  })

  const essayActions: EssayTabActions = useMemo(
    () => ({
      updateBlueprint: ws.updateBlueprint,
      updateInstructionsText: ws.updateInstructionsText,
      attachInstructionFile: ws.attachInstructionFile,
      removeInstructionAttachment: ws.removeInstructionAttachment,
      clearInstructions: ws.clearInstructions,
      applyInstructions: ws.applyInstructions,
      updateQuickSettings: ws.updateQuickSettings,
      updateWordLimit: ws.updateWordLimit,
      updateWordBudgetSection: ws.updateWordBudgetSection,
      updateAnalysis: ws.updateAnalysis,
      rebalanceWordBudget: ws.rebalanceWordBudget,
      resetWordBudgetToTemplate: ws.resetWordBudgetToTemplate,
      reorderWordBudgetSections: ws.reorderWordBudgetSections,
      removeWordBudgetSection: ws.removeWordBudgetSection,
      addWordBudgetSection: ws.addWordBudgetSection,
      generateFramework: ws.generateFramework,
      regenerateFrameworkField: ws.regenerateFrameworkField,
      generateOutline: ws.generateOutline,
      updateOutline: ws.updateOutline,
      regenerateOutline: ws.regenerateOutline,
      undo: ws.undo,
      redo: ws.redo,
      canUndo: ws.canUndo,
      canRedo: ws.canRedo,
      runAnalyzeBlueprint: ws.runAnalyzeBlueprint,
      approveBlueprint: ws.approveBlueprint,
      toggleOutlineCollapse: ws.toggleOutlineCollapse,
      expandAllOutline: ws.expandAllOutline,
      collapseAllOutline: ws.collapseAllOutline,
      selectOutlineNode: ws.selectOutlineNode,
      selectSource: ws.selectSource,
      updateOutlineNode: ws.updateOutlineNode,
      reorderOutlineNodes: ws.reorderOutlineNodes,
      addOutlineNode: ws.addOutlineNode,
      removeOutlineNode: ws.removeOutlineNode,
      convertOutlineNodeType: ws.convertOutlineNodeType,
      moveOutlineNode: ws.moveOutlineNode,
      attachSourceToNode: ws.attachSourceToNode,
      detachSourceFromNode: ws.detachSourceFromNode,
      updateSource: ws.updateSource,
      updateSourceRefQuote: ws.updateSourceRefQuote,
      updateSourceRefQuotes: ws.updateSourceRefQuotes,
      searchSources: ws.searchSources,
      addFoundSourceToNode: ws.addFoundSourceToNode,
      markOutlineReadyForDraft: ws.markOutlineReadyForDraft,
      generateDraftFromOutline: ws.generateDraftFromOutline,
      generatingFullDraft: ws.generatingFullDraft,
      setDraftMode: ws.setDraftMode,
      setActiveDraftSection: ws.setActiveDraftSection,
      updateDraftSectionContent: ws.updateDraftSectionContent,
      updateUnifiedDraft: ws.updateUnifiedDraft,
      generateDraftSection: ws.generateDraftSection,
      draftToolScopes: ws.draftToolScopes,
      highlightedSuggestionId: ws.highlightedSuggestionId,
      setDraftToolScope: ws.setDraftToolScope,
      runDraftTool: ws.runDraftTool,
      runAllDraftTools: ws.runAllDraftTools,
      acceptDraftSuggestion: ws.acceptDraftSuggestion,
      dismissDraftSuggestion: ws.dismissDraftSuggestion,
      replaceDraftSuggestion: ws.replaceDraftSuggestion,
      acceptAllDraftTool: ws.acceptAllDraftTool,
      dismissAllDraftTool: ws.dismissAllDraftTool,
      insertCitationAt: ws.insertCitationAt,
      insertSourceFromSuggestion: ws.insertSourceFromSuggestion,
      toggleDraftInlineHighlights: ws.toggleDraftInlineHighlights,
      highlightDraftSuggestion: ws.highlightDraftSuggestion,
      setTextSelection: ws.setTextSelection,
      setActiveSelectionTool: ws.setActiveSelectionTool,
      clearMultipurposeToolResults: ws.clearMultipurposeToolResults,
      setCitationStyle: ws.setCitationStyle,
      setReferencingStyle: ws.setReferencingStyle,
      reconcileCitations: ws.reconcileCitations,
      addCitation: ws.addCitation,
      enrichSource: ws.enrichSource,
      evaluateSource: ws.evaluateSource,
      enrichAllSources: ws.enrichAllSources,
      evaluateAllSources: ws.evaluateAllSources,
      removeSource: ws.removeSource,
      enrichingIds: ws.enrichingIds,
      evaluatingIds: ws.evaluatingIds,
      bulkEnriching: ws.bulkEnriching,
      bulkEvaluating: ws.bulkEvaluating,
      uploadSourceStub: ws.uploadSourceStub,
      searchOutlineNodeStub: ws.searchOutlineNodeStub,
      saveProgress: ws.saveProgress,
    }),
    [ws],
  )

  const workflow = {
    blueprintApproved: ws.workflow.blueprintApproved,
    outlineReadyForDraft: ws.workflow.outlineReadyForDraft,
    draftHasContent: ws.workflow.draftHasContent,
    draftEverGenerated: ws.workflow.draftEverGenerated,
    hasCitations: ws.workflow.hasCitations,
  }

  return (
    <div className="app">
      {ws.quotaError && (
        <div
          role="alert"
          style={{
            padding: '10px 16px',
            background: 'rgba(220, 38, 38, 0.12)',
            borderBottom: '1px solid rgba(220, 38, 38, 0.3)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{ws.quotaError}</span>
          <button type="button" className="glass-btn" onClick={ws.clearQuotaError}>
            Dismiss
          </button>
        </div>
      )}
      <div className="app-shell">
        <div className="app-shell__sidebar">
          <AppSidebar
            activeNavId={activeNavId}
            activePlan={activePlan}
            onPlanChange={setActivePlan}
            themePreference={ws.themePreference}
            onNavigate={onNavigate}
            onCycleTheme={ws.cycleTheme}
            onUpgrade={() => router.push(isGuest ? '/login' : '/billing')}
          />
        </div>
        <MainWorkspace
          activeNavId={activeNavId}
          essay={ws.essay}
          subscriptionTier={ws.subscriptionTier}
          workflow={workflow}
          analyzing={ws.analyzing}
          generatingOutline={ws.generatingOutline}
          saving={ws.saving}
          essayActions={essayActions}
        />
      </div>
    </div>
  )
}
