import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText, streamText, type LanguageModel } from 'ai'
import type { z } from 'zod'

export const MODEL_ID = 'deepseek/deepseek-v4-flash'

const gatewayClient = createOpenAI({
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.AI_GATEWAY_API_KEY,
  compatibility: 'compatible',
})

export function getModel(): LanguageModel {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error('AI_GATEWAY_API_KEY is not configured.')
  }
  return gatewayClient(MODEL_ID)
}

export function isLlmConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY)
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompletionOptions {
  system?: string
  temperature?: number
  maxTokens?: number
}

function toSdkMessages(messages: LLMMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

export async function complete(
  messages: LLMMessage[],
  options: CompletionOptions = {},
): Promise<string> {
  const model = getModel()
  const { text } = await generateText({
    model,
    system: options.system,
    messages: toSdkMessages(messages),
    temperature: options.temperature ?? 0.35,
    maxTokens: options.maxTokens ?? 4096,
  })
  return text
}

export async function completeStructured<T extends z.ZodType>(
  schema: T,
  messages: LLMMessage[],
  options: CompletionOptions = {},
): Promise<z.infer<T>> {
  const model = getModel()
  try {
    const { object } = await generateObject({
      model,
      schema,
      system: options.system,
      messages: toSdkMessages(messages),
      temperature: options.temperature ?? 0.3,
      maxTokens: options.maxTokens ?? 4096,
    })
    return object
  } catch {
    const text = await complete(messages, { ...options, temperature: options.temperature ?? 0.2 })
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('LLM did not return valid JSON')
    const parsed = JSON.parse(jsonMatch[0]) as unknown
    return schema.parse(parsed)
  }
}

export function streamDraft(messages: LLMMessage[], options: CompletionOptions = {}) {
  const model = getModel()
  return streamText({
    model,
    system: options.system,
    messages: toSdkMessages(messages),
    temperature: options.temperature ?? 0.35,
    maxTokens: options.maxTokens ?? 4096,
  })
}

/** @deprecated Use complete() — kept for gradual migration */
export async function completeDraft(
  messages: LLMMessage[],
  options: CompletionOptions = {},
): Promise<string> {
  return complete(messages, options)
}

/** @deprecated Use getModel() */
export function getDraftModel(): LanguageModel {
  return getModel()
}
