import { z } from 'zod'

export const agentTools = {
  updateBlueprintField: {
    description: 'Update a blueprint field (title, thesis, or researchQuestion)',
    parameters: z.object({
      field: z.enum(['title', 'thesis', 'researchQuestion']),
      value: z.string(),
    }),
  },
  updateOutlineNode: {
    description: 'Update bullets for an outline node by id',
    parameters: z.object({
      nodeId: z.string(),
      bullets: z.array(z.string()),
      title: z.string().optional(),
    }),
  },
  writeDraftSection: {
    description: 'Write or replace content for a draft section',
    parameters: z.object({
      sectionId: z.string(),
      content: z.string(),
    }),
  },
  addCitation: {
    description: 'Add an in-text citation linked to a source',
    parameters: z.object({
      sourceId: z.string(),
      sectionId: z.string(),
      inText: z.string().optional(),
    }),
  },
  navigateToTab: {
    description: 'Navigate the user to a workflow tab',
    parameters: z.object({
      tab: z.enum(['blueprint', 'outline', 'draft', 'references', 'export']),
      blueprintSection: z.enum(['instructions', 'framework']).optional(),
      draftSubView: z.enum(['editing', 'auditing', 'polishing']).optional(),
    }),
  },
} as const

export type AgentToolName = keyof typeof agentTools

export interface ToolCallPayload {
  name: AgentToolName
  args: Record<string, unknown>
}
