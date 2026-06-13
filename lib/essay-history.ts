import type { EssayState } from '@/types'

const MAX_HISTORY = 50

export function cloneEssayState(state: EssayState): EssayState {
  return structuredClone(state)
}

export type EssayHistoryStacks = {
  undo: EssayState[]
  redo: EssayState[]
}

export function createHistoryStacks(): EssayHistoryStacks {
  return { undo: [], redo: [] }
}

export function pushHistorySnapshot(
  stacks: EssayHistoryStacks,
  snapshot: EssayState,
): EssayHistoryStacks {
  const undo = [...stacks.undo, cloneEssayState(snapshot)]
  if (undo.length > MAX_HISTORY) undo.shift()
  return { undo, redo: [] }
}

export function popUndo(
  stacks: EssayHistoryStacks,
  current: EssayState,
): { stacks: EssayHistoryStacks; state: EssayState | null } {
  if (stacks.undo.length === 0) return { stacks, state: null }
  const undo = [...stacks.undo]
  const previous = undo.pop()!
  return {
    stacks: {
      undo,
      redo: [cloneEssayState(current), ...stacks.redo],
    },
    state: previous,
  }
}

export function popRedo(
  stacks: EssayHistoryStacks,
  current: EssayState,
): { stacks: EssayHistoryStacks; state: EssayState | null } {
  if (stacks.redo.length === 0) return { stacks, state: null }
  const redo = [...stacks.redo]
  const next = redo.pop()!
  return {
    stacks: {
      undo: [...stacks.undo, cloneEssayState(current)],
      redo,
    },
    state: next,
  }
}
