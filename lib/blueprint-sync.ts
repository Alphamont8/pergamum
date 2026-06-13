import type { EssayBlueprint, OutlineNode, WordBudget, WordBudgetSection } from '@/types'
import { createSectionNodesForBudget } from '@/state/essayInitial'

export type BudgetSectionSnapshot = { id: string; label: string }

export function blueprintInputFingerprint(blueprint: EssayBlueprint): string {
  return JSON.stringify({
    instructionsText: blueprint.instructionsText,
    attachments: blueprint.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      status: a.status,
      kind: a.kind,
    })),
    quickSettings: blueprint.quickSettings,
    wordLimit: blueprint.wordLimit,
  })
}

export function wordBudgetSnapshot(budget: WordBudget): BudgetSectionSnapshot[] {
  return budget.sections.map((s) => ({ id: s.id, label: s.label }))
}

export function wordBudgetSnapshotJson(budget: WordBudget): string {
  return JSON.stringify(wordBudgetSnapshot(budget))
}

export function parseBudgetSnapshot(
  json: string | null | undefined,
): BudgetSectionSnapshot[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as BudgetSectionSnapshot[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function isBudgetSectionUnchanged(
  snapshot: BudgetSectionSnapshot[] | null,
  sec: WordBudgetSection,
): boolean {
  if (!snapshot) return false
  const prev = snapshot.find((s) => s.id === sec.id)
  return prev != null && prev.label === sec.label
}

export function outlineSectionIdForBudget(budgetSectionId: string): string {
  return `node-${budgetSectionId}`
}

function collectSubtree(nodes: OutlineNode[], rootId: string): OutlineNode[] {
  const result: OutlineNode[] = []
  const visit = (id: string) => {
    const node = nodes.find((n) => n.id === id)
    if (!node) return
    result.push(node)
    nodes
      .filter((n) => n.parentId === id)
      .sort((a, b) => a.order - b.order)
      .forEach((child) => visit(child.id))
  }
  visit(rootId)
  return result
}

export function mergeOutlineWithBudget(
  currentNodes: OutlineNode[],
  blueprint: EssayBlueprint,
): OutlineNode[] {
  const budget = blueprint.wordBudget
  const prevSnapshot = parseBudgetSnapshot(blueprint.outlineBudgetFingerprint)
  const merged: OutlineNode[] = []

  budget.sections.forEach((sec, order) => {
    const sectionNodeId = outlineSectionIdForBudget(sec.id)
    const existingSection = currentNodes.find(
      (n) => n.id === sectionNodeId && n.type === 'section',
    )
    const unchanged =
      isBudgetSectionUnchanged(prevSnapshot, sec) && existingSection != null

    if (unchanged && existingSection) {
      const subtree = collectSubtree(currentNodes, sectionNodeId)
      for (const node of subtree) {
        if (node.id === sectionNodeId) {
          merged.push({ ...node, title: sec.label, order })
        } else {
          merged.push(node)
        }
      }
    } else {
      merged.push(...createSectionNodesForBudget(sec, order, blueprint))
    }
  })

  return merged
}
