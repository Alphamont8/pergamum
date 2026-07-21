/**
 * LlamaParse + LlamaExtract PDF fallback when Exa Contents leaves authors/dates thin.
 * Uses source_url parse (cost_effective) then Extract with a bibliographic schema.
 */
import type { PageMetadata } from '@/lib/enrichment/exa'
import { parseMetadataFromText } from '@/lib/enrichment/parsePageMetadata'
import {
  cleanSiteName,
  cleanTitle,
  formatTeamName,
  normalizeAuthors,
  normalizePublicationDate,
} from '@/lib/citations/normalize'

const LLAMA_API = 'https://api.cloud.llamaindex.ai'
const PARSE_TIER = 'cost_effective'
const EXTRACT_TIER = 'cost_effective'
/** Cover + front matter is enough for authors/dates and a verify snippet. */
const TARGET_PAGES = '1-5'
const POLL_MS = 1500
const MAX_WAIT_MS = 55_000

const BIB_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Document or article title from the cover or first page',
    },
    authors: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Individual author names as written on the cover or byline. Prefer people over organizations when both appear.',
    },
    organization: {
      type: 'string',
      description:
        'Publishing organization or institutional author when no individual authors are listed (e.g. American Academy of Sleep Medicine, Centers for Disease Control and Prevention).',
    },
    publishedDate: {
      type: 'string',
      description:
        'Publication, release, or last-reviewed date as ISO YYYY-MM-DD when possible, otherwise as written on the document.',
    },
    year: {
      type: 'integer',
      description: 'Four-digit publication year',
    },
  },
} as const

type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string

interface LlamaJobEnvelope {
  id?: string
  status?: JobStatus
  project_id?: string
  error_message?: string | null
  job?: {
    id?: string
    status?: JobStatus
    project_id?: string
    error_message?: string | null
  }
  markdown_full?: string
  text_full?: string
  extract_result?: unknown
}

function apiKey(): string | undefined {
  return process.env.LLAMA_CLOUD_API_KEY?.trim() || undefined
}

function projectIdHint(): string | undefined {
  return process.env.LLAMA_CLOUD_PROJECT_ID?.trim() || undefined
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url)
}

/** True when Exa left bibliographic fields thin for a PDF (authors and/or date). */
export function needsLlamaPdfFallback(
  meta: PageMetadata | null | undefined,
  url?: string,
): boolean {
  if (!meta) return true
  const hasDate = Boolean(meta.publishedDate?.trim() || meta.year?.trim())
  const authors = meta.authors?.trim()
  if (!authors) return true
  if (!hasDate) return true

  // Host-derived org placeholders (e.g. "Aasm") are not enough — still try cover-page extract.
  if (url) {
    const site = cleanSiteName(undefined, url)
    if (site && authors.toLowerCase() === site.toLowerCase()) return true
  }

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function llamaFetch<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | undefined> },
): Promise<T | null> {
  const key = apiKey()
  if (!key) return null

  const url = new URL(`${LLAMA_API}${path}`)
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v) url.searchParams.set(k, v)
  }

  const { query: _q, ...rest } = init ?? {}
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.warn('[llama] request failed', path, res.status, body.slice(0, 240))
    return null
  }
  return res.json() as Promise<T>
}

function jobFields(envelope: LlamaJobEnvelope | null): {
  id?: string
  status?: JobStatus
  projectId?: string
  error?: string | null
} {
  if (!envelope) return {}
  const job = envelope.job
  return {
    id: job?.id || envelope.id,
    status: job?.status || envelope.status,
    projectId: job?.project_id || envelope.project_id,
    error: job?.error_message ?? envelope.error_message,
  }
}

async function pollUntilComplete(
  kind: 'parse' | 'extract',
  jobId: string,
  projectId: string | undefined,
  startedAt: number,
  expand?: string,
): Promise<LlamaJobEnvelope | null> {
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await sleep(POLL_MS)
    const path =
      kind === 'parse'
        ? `/api/v2/parse/${jobId}`
        : `/api/v2/extract/${jobId}`
    const data = await llamaFetch<LlamaJobEnvelope>(path, {
      method: 'GET',
      query: {
        project_id: projectId || projectIdHint(),
        expand,
      },
    })
    const { status, error } = jobFields(data)
    if (!data || !status) continue
    if (status === 'COMPLETED') return data
    if (status === 'FAILED' || status === 'CANCELLED') {
      console.warn(`[llama] ${kind} ${status}`, jobId, error)
      return null
    }
  }
  console.warn(`[llama] ${kind} timed out`, jobId)
  return null
}

function authorsFromExtract(raw: {
  authors?: unknown
  organization?: unknown
}): {
  authors?: string
  authorships?: Array<{ name: string; literal?: boolean }>
  organization?: string
} {
  const org =
    typeof raw.organization === 'string' && raw.organization.trim()
      ? formatTeamName(raw.organization.trim())
      : undefined

  let authorList: string[] = []
  if (Array.isArray(raw.authors)) {
    authorList = raw.authors
      .filter((a): a is string => typeof a === 'string' && Boolean(a.trim()))
      .map((a) => a.trim())
  } else if (typeof raw.authors === 'string' && raw.authors.trim()) {
    authorList = [raw.authors.trim()]
  }

  if (authorList.length) {
    const bits = normalizeAuthors(authorList.join(', '))
    return { authors: bits.authors, authorships: bits.authorships, organization: org }
  }

  if (org) {
    return {
      authors: org,
      authorships: [{ name: org, literal: true }],
      organization: org,
    }
  }

  return { organization: org }
}

function pageMetadataFromExtract(
  extractResult: unknown,
  text: string | undefined,
  url: string,
): PageMetadata {
  const raw = (Array.isArray(extractResult) ? extractResult[0] : extractResult) as
    | {
        title?: unknown
        authors?: unknown
        organization?: unknown
        publishedDate?: unknown
        year?: unknown
      }
    | null
    | undefined

  const fromExtract = raw
    ? authorsFromExtract(raw)
    : { authors: undefined, authorships: undefined, organization: undefined }

  const publishedRaw =
    typeof raw?.publishedDate === 'string' ? raw.publishedDate : undefined
  const yearRaw =
    typeof raw?.year === 'number'
      ? String(raw.year)
      : typeof raw?.year === 'string'
        ? raw.year
        : undefined
  const dateBits = normalizePublicationDate(publishedRaw, yearRaw)

  const fromText = parseMetadataFromText(text ?? '', {
    url,
    title: typeof raw?.title === 'string' ? raw.title : undefined,
  })

  const authors = fromExtract.authors || fromText.authors
  const authorships = fromExtract.authorships || fromText.authorships
  const publishedDate = dateBits.publicationDate || fromText.publishedDate
  const year = dateBits.year || fromText.year || publishedDate?.slice(0, 4)
  const organization = fromExtract.organization || fromText.organization

  let host: string | undefined
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    host = undefined
  }

  const siteName = cleanSiteName(organization || host, url)
  const titleRaw = typeof raw?.title === 'string' ? raw.title : undefined

  return {
    title: cleanTitle(titleRaw, siteName),
    authors,
    authorships,
    publishedDate,
    year,
    siteName,
    organization,
    summary: text?.slice(0, 800),
    text,
  }
}

/**
 * Parse a public PDF URL with LlamaParse, then LlamaExtract bibliographic fields.
 * Returns null when the API key is unset or the job fails/times out.
 */
export async function fetchPdfMetadataWithLlama(url: string): Promise<PageMetadata | null> {
  if (!apiKey() || !url) return null

  const startedAt = Date.now()

  const created = await llamaFetch<LlamaJobEnvelope>('/api/v2/parse', {
    method: 'POST',
    query: { project_id: projectIdHint() },
    body: JSON.stringify({
      source_url: url,
      tier: PARSE_TIER,
      version: 'latest',
      target_pages: TARGET_PAGES,
    }),
  })

  const createdFields = jobFields(created)
  if (!createdFields.id) {
    // Retry without target_pages if the API rejected the field.
    const retry = await llamaFetch<LlamaJobEnvelope>('/api/v2/parse', {
      method: 'POST',
      query: { project_id: projectIdHint() },
      body: JSON.stringify({
        source_url: url,
        tier: PARSE_TIER,
        version: 'latest',
      }),
    })
    Object.assign(createdFields, jobFields(retry))
  }

  if (!createdFields.id) return null

  const projectId = createdFields.projectId || projectIdHint()
  const parsed = await pollUntilComplete(
    'parse',
    createdFields.id,
    projectId,
    startedAt,
    'markdown_full,text_full',
  )
  if (!parsed) return null

  const text =
    (typeof parsed.markdown_full === 'string' && parsed.markdown_full) ||
    (typeof parsed.text_full === 'string' && parsed.text_full) ||
    undefined

  const parseJobId = jobFields(parsed).id || createdFields.id
  const extractProjectId = jobFields(parsed).projectId || projectId

  const extractCreated = await llamaFetch<LlamaJobEnvelope>('/api/v2/extract', {
    method: 'POST',
    query: { project_id: extractProjectId },
    body: JSON.stringify({
      file_input: parseJobId,
      configuration: {
        tier: EXTRACT_TIER,
        version: 'latest',
        extraction_target: 'per_doc',
        max_pages: 5,
        cite_sources: false,
        confidence_scores: false,
        data_schema: BIB_SCHEMA,
        system_prompt:
          'Extract bibliographic metadata from the cover page and front matter only. Prefer named people as authors; if only an organization authored the work, put that name in organization and leave authors empty.',
      },
    }),
  })

  const extractId = jobFields(extractCreated).id
  if (!extractId) {
    // Parse text alone is still useful for verify + regex metadata.
    if (!text?.trim()) return null
    return pageMetadataFromExtract(null, text, url)
  }

  const extracted = await pollUntilComplete(
    'extract',
    extractId,
    extractProjectId || jobFields(extractCreated).projectId,
    startedAt,
  )

  const extractResult = extracted?.extract_result
  if (!extractResult && !text?.trim()) return null

  return pageMetadataFromExtract(extractResult ?? null, text, url)
}

/** Fill gaps in Exa metadata with Llama PDF results (prefer Llama for missing/weak authors/dates). */
export function mergePdfMetadata(
  primary: PageMetadata | null,
  fallback: PageMetadata,
  url?: string,
): PageMetadata {
  if (!primary) return fallback

  const site = url ? cleanSiteName(undefined, url) : undefined
  const primaryAuthors = primary.authors?.trim()
  const primaryIsHostAuthor =
    Boolean(site && primaryAuthors && primaryAuthors.toLowerCase() === site.toLowerCase())
  const preferFallbackAuthors = !primaryAuthors || primaryIsHostAuthor
  const preferFallbackDate = !primary.publishedDate?.trim() && !primary.year?.trim()

  const authors = preferFallbackAuthors
    ? fallback.authors || primary.authors
    : primary.authors || fallback.authors
  const authorships = preferFallbackAuthors
    ? fallback.authorships?.length
      ? fallback.authorships
      : primary.authorships
    : primary.authorships?.length
      ? primary.authorships
      : fallback.authorships
  const publishedDate = preferFallbackDate
    ? fallback.publishedDate || primary.publishedDate
    : primary.publishedDate || fallback.publishedDate
  const year = preferFallbackDate
    ? fallback.year || primary.year || publishedDate?.slice(0, 4)
    : primary.year || fallback.year || publishedDate?.slice(0, 4)

  const primaryText = primary.text?.trim() ?? ''
  const fallbackText = fallback.text?.trim() ?? ''
  const useFallbackText =
    fallbackText.length > primaryText.length + 200 || primaryText.length < 400

  return {
    title: primary.title || fallback.title,
    authors,
    authorships,
    publishedDate,
    year,
    siteName: preferFallbackAuthors
      ? fallback.siteName || primary.siteName
      : primary.siteName || fallback.siteName,
    organization: preferFallbackAuthors
      ? fallback.organization || primary.organization
      : primary.organization || fallback.organization,
    summary: useFallbackText
      ? fallback.summary || primary.summary
      : primary.summary || fallback.summary,
    text: useFallbackText ? fallback.text || primary.text : primary.text || fallback.text,
    highlights: primary.highlights?.length ? primary.highlights : fallback.highlights,
    favicon: primary.favicon || fallback.favicon,
    image: primary.image || fallback.image,
  }
}
