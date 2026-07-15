import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText, embedMany, type LanguageModel } from 'ai'
import type { z } from 'zod'

export const MODEL_ID = 'deepseek/deepseek-v4-flash'
export const EMBEDDING_MODEL_ID = 'openai/text-embedding-3-small'

/**
 * DeepSeek uses implicit prompt caching on matching prefixes.
 * `caching: 'auto'` is a no-op for DeepSeek but enables explicit cache markers
 * if the gateway ever routes to Anthropic/MiniMax fallbacks.
 */
const GATEWAY_PROVIDER_OPTIONS = {
  gateway: {
    caching: 'auto' as const,
  },
}

function resolveGatewayApiKey(): string | undefined {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  return key?.trim() || undefined
}

let gatewayClient: ReturnType<typeof createOpenAI> | null = null

function getGatewayClient() {
  const apiKey = resolveGatewayApiKey()
  if (!apiKey) {
    throw new Error(
      'AI is not configured. Set AI_GATEWAY_API_KEY or deploy on Vercel with AI Gateway OIDC.',
    )
  }
  if (!gatewayClient) {
    gatewayClient = createOpenAI({
      baseURL: 'https://ai-gateway.vercel.sh/v1',
      apiKey,
      compatibility: 'compatible',
    })
  }
  return gatewayClient
}

export function getModel(): LanguageModel {
  return getGatewayClient()(MODEL_ID)
}

export function isLlmConfigured(): boolean {
  return Boolean(resolveGatewayApiKey())
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
    providerOptions: GATEWAY_PROVIDER_OPTIONS,
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
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
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

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const client = getGatewayClient()
  const { embeddings } = await embedMany({
    model: client.embedding(EMBEDDING_MODEL_ID),
    values: texts,
  })
  return embeddings
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}
