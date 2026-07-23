import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText, embedMany, type LanguageModel } from 'ai'
import type { z } from 'zod'

export const MODEL_ID = 'deepseek/deepseek-v4-flash'
export const EMBEDDING_MODEL_ID = 'openai/text-embedding-3-small'

const JSON_REPLY_SUFFIX =
  '\n\nReturn one JSON object only. No markdown fences, commentary, or extra text.'

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
  /** Caller-owned abort (e.g. request shutdown). */
  abortSignal?: AbortSignal
  /** Soft per-attempt timeout. Combined with abortSignal when both are set. */
  timeoutMs?: number
  /**
   * `full` tries text → generateObject → text retry.
   * `fast` stops after the first text completion (better under time budgets).
   */
  structuredMode?: 'full' | 'fast'
}

function toSdkMessages(messages: LLMMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))
}

function withJsonSystem(system?: string): string {
  const base = system?.trim() ?? ''
  return base.includes('JSON object only') ? base : `${base}${JSON_REPLY_SUFFIX}`
}

function resolveAbortSignal(options: CompletionOptions): AbortSignal | undefined {
  const signals: AbortSignal[] = []
  if (options.abortSignal) signals.push(options.abortSignal)
  if (options.timeoutMs && options.timeoutMs > 0) {
    signals.push(AbortSignal.timeout(options.timeoutMs))
  }
  if (signals.length === 0) return undefined
  if (signals.length === 1) return signals[0]
  return AbortSignal.any(signals)
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
  return /\b(aborted|abort|timeout|timed out)\b/i.test(err.message)
}

function findJsonStart(text: string): { source: string; start: number } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1]?.trim() ? fenced[1].trim() : text
  const start = source.indexOf('{')
  if (start < 0) return null
  return { source, start }
}

/** Close truncated JSON by ending open strings and balancing braces/brackets. */
export function repairTruncatedJson(text: string): string | null {
  const located = findJsonStart(text)
  if (!located) return null

  let slice = located.source.slice(located.start)
  let inString = false
  let escaped = false
  const stack: Array<'{' | '['> = []

  for (let i = 0; i < slice.length; i += 1) {
    const ch = slice[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') stack.push('{')
    else if (ch === '[') stack.push('[')
    else if (ch === '}' || ch === ']') {
      const open = stack[stack.length - 1]
      if ((ch === '}' && open === '{') || (ch === ']' && open === '[')) stack.pop()
    }
  }

  if (inString) slice += '"'

  // Drop incomplete trailing properties / separators from truncation.
  slice = slice
    .replace(/,\s*"[^"]*"\s*$/, '') // complete key, missing value
    .replace(/,\s*"[^"]*$/, '') // mid-key (if close-quote didn't apply)
    .replace(/:\s*$/, ': null')
    .replace(/,\s*$/, '')

  while (stack.length > 0) {
    const open = stack.pop()
    slice += open === '{' ? '}' : ']'
  }

  try {
    JSON.parse(slice)
    return slice
  } catch {
    // Last resort: cut to the last fully closed object/array element.
    const lastObj = slice.lastIndexOf('}')
    if (lastObj < 0) return null
    let trimmed = slice.slice(0, lastObj + 1).replace(/,\s*$/, '')
    // Re-close any arrays/objects still open after the cut.
    const restack: Array<'{' | '['> = []
    inString = false
    escaped = false
    for (let i = 0; i < trimmed.length; i += 1) {
      const ch = trimmed[i]
      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (ch === '\\') {
          escaped = true
          continue
        }
        if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') restack.push('{')
      else if (ch === '[') restack.push('[')
      else if (ch === '}' || ch === ']') restack.pop()
    }
    while (restack.length > 0) {
      const open = restack.pop()
      trimmed += open === '{' ? '}' : ']'
    }
    try {
      JSON.parse(trimmed)
      return trimmed
    } catch {
      return null
    }
  }
}

/** Pull the first JSON object from a model reply (handles fenced / truncated blocks). */
export function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Strip common model prefixes before the JSON payload.
  const withoutPrefix = trimmed
    .replace(/^(?:here(?:'s| is) (?:the )?json[:\s]*)/i, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const located = findJsonStart(withoutPrefix) ?? findJsonStart(trimmed)
  if (!located) {
    const arrayStart = withoutPrefix.indexOf('[')
    if (arrayStart >= 0) {
      const arrayJson = extractBalancedJson(withoutPrefix, arrayStart, '[', ']')
      if (arrayJson) {
        try {
          const parsed = JSON.parse(arrayJson)
          if (Array.isArray(parsed)) {
            return JSON.stringify({ sentences: parsed })
          }
        } catch {
          /* fall through */
        }
      }
    }
    return null
  }

  const { source, start } = located
  return extractBalancedJson(source, start, '{', '}') ?? repairTruncatedJson(withoutPrefix) ?? repairTruncatedJson(trimmed)
}

function extractBalancedJson(
  source: string,
  start: number,
  open: '[' | '{',
  close: ']' | '}',
): string | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) depth += 1
    if (ch === close) {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return null
}

function humanizeStructuredParseError(message: string): string {
  if (/did not return a json object/i.test(message)) {
    return "We couldn't read the analysis from the model. Try again."
  }
  if (/empty response/i.test(message)) {
    return 'The model returned an empty response. Try again.'
  }
  if (/could not parse/i.test(message)) {
    return "We couldn't read the analysis from the model. Try again."
  }
  if (/missing a required field/i.test(message)) {
    return "We couldn't read a complete analysis from the model. Try again."
  }
  return message
}

function parseStructuredJson<T extends z.ZodType>(
  schema: T,
  text: string,
): z.infer<T> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('The model returned an empty response.')
  }
  const json = extractJsonObject(trimmed)
  if (!json) {
    console.warn('[llm] no JSON object in model reply:', trimmed.slice(0, 240).replace(/\s+/g, ' '))
    throw new Error('The model did not return a JSON object.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('The model returned JSON we could not parse.')
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? 'schema mismatch'
    throw new Error(`The model JSON was missing a required field (${detail}).`)
  }
  return result.data
}

async function generateObjectSalvage<T extends z.ZodType>(
  schema: T,
  messages: LLMMessage[],
  options: CompletionOptions,
  system: string,
  temperature: number,
  maxTokens: number,
  remainingTimeoutMs: () => number | undefined,
): Promise<z.infer<T> | null> {
  const budget = remainingTimeoutMs()
  if (budget != null && budget < 12_000) return null
  try {
    const { object } = await generateObject({
      model: getModel(),
      schema,
      system,
      messages: toSdkMessages(messages),
      temperature,
      maxTokens,
      abortSignal: resolveAbortSignal({
        abortSignal: options.abortSignal,
        timeoutMs: remainingTimeoutMs(),
      }),
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    })
    return object
  } catch {
    return null
  }
}

export async function complete(
  messages: LLMMessage[],
  options: CompletionOptions = {},
): Promise<string> {
  const model = getModel()
  const abortSignal = resolveAbortSignal(options)
  const { text } = await generateText({
    model,
    system: options.system,
    messages: toSdkMessages(messages),
    temperature: options.temperature ?? 0.35,
    maxTokens: options.maxTokens ?? 4096,
    abortSignal,
    providerOptions: GATEWAY_PROVIDER_OPTIONS,
  })
  return text
}

async function completeNonEmpty(
  messages: LLMMessage[],
  options: CompletionOptions,
): Promise<string> {
  const first = await complete(messages, options)
  if (first.trim()) return first
  if (options.abortSignal?.aborted) {
    throw new Error('The model request was aborted.')
  }
  // Empty replies are intermittent on the gateway — one quiet retry.
  return complete(messages, {
    ...options,
    temperature: Math.max(0.1, (options.temperature ?? 0.35) - 0.05),
  })
}

export async function completeStructured<T extends z.ZodType>(
  schema: T,
  messages: LLMMessage[],
  options: CompletionOptions = {},
): Promise<z.infer<T>> {
  const model = getModel()
  const system = withJsonSystem(options.system)
  const temperature = options.temperature ?? 0.25
  const maxTokens = options.maxTokens ?? 4096
  const structuredMode = options.structuredMode ?? 'full'
  const deadlineAt =
    options.timeoutMs && options.timeoutMs > 0 ? Date.now() + options.timeoutMs : null
  const errors: string[] = []

  const remainingTimeoutMs = (): number | undefined => {
    if (deadlineAt == null) return options.timeoutMs
    return Math.max(1, deadlineAt - Date.now())
  }

  const attemptOptions = (): CompletionOptions => ({
    ...options,
    system,
    temperature,
    maxTokens,
    timeoutMs: remainingTimeoutMs(),
  })

  // Plain JSON completion is more reliable than gateway JSON-schema mode for DeepSeek.
  try {
    const text = await completeNonEmpty(messages, attemptOptions())
    return parseStructuredJson(schema, text)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'text parse failed')
    if (isAbortError(err)) {
      console.warn('[llm] structured output failed:', errors.join(' | '))
      throw new Error('That took too long. Try again or shorten your draft.')
    }
    // Always try gateway structured mode once before giving up — 'fast' used to
    // hard-fail on the first bad prose reply and break Analyze.
    const salvaged = await generateObjectSalvage(
      schema,
      messages,
      options,
      system,
      temperature,
      maxTokens,
      remainingTimeoutMs,
    )
    if (salvaged != null) return salvaged

    if (structuredMode === 'fast') {
      // One nudged text retry before failing fast paths.
      try {
        const nudged = await completeNonEmpty(
          [
            ...messages,
            {
              role: 'user',
              content:
                'Your previous reply was not valid JSON. Reply again with one JSON object only matching the required schema. No markdown, no commentary.',
            },
          ],
          {
            ...attemptOptions(),
            temperature: Math.max(0.05, temperature - 0.1),
          },
        )
        return parseStructuredJson(schema, nudged)
      } catch (retryErr) {
        errors.push(retryErr instanceof Error ? retryErr.message : 'nudged retry failed')
        console.warn('[llm] structured output failed:', errors.join(' | '))
        throw new Error(
          humanizeStructuredParseError(
            err instanceof Error
              ? err.message
              : "We couldn't read a valid analysis response from the model. Try again.",
          ),
        )
      }
    }
  }

  if (deadlineAt != null && Date.now() >= deadlineAt) {
    throw new Error('That took too long. Try again or shorten your draft.')
  }

  try {
    const { object } = await generateObject({
      model,
      schema,
      system,
      messages: toSdkMessages(messages),
      temperature,
      maxTokens,
      abortSignal: resolveAbortSignal({
        abortSignal: options.abortSignal,
        timeoutMs: remainingTimeoutMs(),
      }),
      providerOptions: GATEWAY_PROVIDER_OPTIONS,
    })
    return object
  } catch (objectErr) {
    errors.push(objectErr instanceof Error ? objectErr.message : 'generateObject failed')
    if (isAbortError(objectErr)) {
      console.warn('[llm] structured output failed:', errors.join(' | '))
      throw new Error('That took too long. Try again or shorten your draft.')
    }
  }

  if (deadlineAt != null && Date.now() >= deadlineAt) {
    throw new Error('That took too long. Try again or shorten your draft.')
  }

  try {
    const text = await completeNonEmpty(messages, {
      ...attemptOptions(),
      temperature: Math.max(0.1, temperature - 0.05),
      maxTokens: Math.max(maxTokens, 8192),
    })
    return parseStructuredJson(schema, text)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'retry parse failed')
    if (isAbortError(err)) {
      console.warn('[llm] structured output failed:', errors.join(' | '))
      throw new Error('That took too long. Try again or shorten your draft.')
    }
  }

  console.warn('[llm] structured output failed:', errors.join(' | '))
  throw new Error("We couldn't read a valid analysis response from the model. Try again or shorten your draft.")
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
