import type { z } from 'zod'
import { completeStructured } from '@/lib/ai/provider'

export * from './schemas'
export * from './parsers'

export async function digestStructured<T extends z.ZodType>(
  schema: T,
  system: string,
  userContent: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<z.infer<T>> {
  return completeStructured(schema, [{ role: 'user', content: userContent }], {
    system,
    temperature: options?.temperature ?? 0.3,
    maxTokens: options?.maxTokens,
  })
}
