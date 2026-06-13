const LLAMA_BASE = 'https://api.cloud.llamaindex.ai'
const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 120_000

export interface LlamaParseResult {
  text: string
  provider: 'llamaparse'
}

function getApiKey(): string | null {
  return process.env.LLAMA_CLOUD_API_KEY ?? null
}

async function llamaFetch<T>(
  path: string,
  init: RequestInit & { json?: Record<string, unknown> } = {},
): Promise<T> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not configured')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }

  const body = init.json ? JSON.stringify(init.json) : init.body
  if (init.json) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${LLAMA_BASE}${path}`, {
    ...init,
    headers,
    body,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`LlamaParse error ${res.status}: ${errText.slice(0, 200)}`)
  }

  return res.json() as Promise<T>
}

export async function uploadFileToLlama(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not configured')

  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), fileName)

  const res = await fetch(`${LLAMA_BASE}/api/v1/files/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
    body: form,
  })

  if (!res.ok) {
    throw new Error(`LlamaParse upload failed: ${res.status}`)
  }

  const data = (await res.json()) as { id?: string }
  if (!data.id) throw new Error('LlamaParse upload returned no file id')
  return data.id
}

export async function parseFileById(fileId: string): Promise<LlamaParseResult> {
  const job = await llamaFetch<{ job?: { id?: string } }>('/api/v2/parse', {
    method: 'POST',
    json: {
      file_id: fileId,
      tier: 'agentic',
      version: 'latest',
    },
  })

  const jobId = job.job?.id
  if (!jobId) throw new Error('LlamaParse returned no job id')

  const started = Date.now()
  while (Date.now() - started < MAX_POLL_MS) {
    const result = await llamaFetch<{
      job?: { status?: string; error_message?: string }
      markdown?: { content?: string }
      text_full?: string
    }>(`/api/v2/parse/${jobId}?expand=markdown,text_full`, { method: 'GET' })

    const status = result.job?.status
    if (status === 'COMPLETED') {
      const text =
        result.markdown?.content ??
        result.text_full ??
        ''
      if (!text.trim()) throw new Error('LlamaParse returned empty text')
      return { text: text.trim(), provider: 'llamaparse' }
    }
    if (status === 'FAILED') {
      throw new Error(result.job?.error_message ?? 'LlamaParse job failed')
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  throw new Error('LlamaParse timed out')
}

export async function parseUrlWithLlama(url: string): Promise<LlamaParseResult> {
  const job = await llamaFetch<{ job?: { id?: string } }>('/api/v2/parse', {
    method: 'POST',
    json: {
      source_url: url,
      tier: 'agentic',
      version: 'latest',
    },
  })

  const jobId = job.job?.id
  if (!jobId) throw new Error('LlamaParse returned no job id')

  const started = Date.now()
  while (Date.now() - started < MAX_POLL_MS) {
    const result = await llamaFetch<{
      job?: { status?: string; error_message?: string }
      markdown?: { content?: string }
      text_full?: string
    }>(`/api/v2/parse/${jobId}?expand=markdown,text_full`, { method: 'GET' })

    const status = result.job?.status
    if (status === 'COMPLETED') {
      const text = result.markdown?.content ?? result.text_full ?? ''
      if (!text.trim()) throw new Error('LlamaParse returned empty text')
      return { text: text.trim(), provider: 'llamaparse' }
    }
    if (status === 'FAILED') {
      throw new Error(result.job?.error_message ?? 'LlamaParse job failed')
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }

  throw new Error('LlamaParse timed out')
}

export async function parseBufferWithLlama(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<LlamaParseResult> {
  const fileId = await uploadFileToLlama(buffer, fileName, mimeType)
  return parseFileById(fileId)
}

export function isLlamaParseConfigured(): boolean {
  return Boolean(getApiKey())
}
