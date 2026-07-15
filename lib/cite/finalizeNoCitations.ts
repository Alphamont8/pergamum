import type { SupabaseClient } from '@supabase/supabase-js'

export function buildNoCitationResult(essay: string) {
  return {
    essay,
    originalEssay: essay,
    bibliography: [] as string[],
    citations: [] as Array<{
      index: number
      sentence: string
      status: string
    }>,
  }
}

/** Mark a draft complete when analysis found no sentences needing citations. */
export async function finalizeNoCitationGeneration(
  service: SupabaseClient,
  generation: { id: string; title?: string | null; essay_input: string },
  options?: { reasoning?: string },
) {
  const result = buildNoCitationResult(generation.essay_input)

  await service
    .from('generations')
    .update({
      status: 'completed',
      result,
      cites_spent: 0,
      progress: {
        step: 'completed',
        current: 0,
        total: 0,
        message: 'No citations needed.',
        reasoning: options?.reasoning || undefined,
      },
    })
    .eq('id', generation.id)
}
