/**
 * US case-law search via CourtListener (Free Law Project).
 * Requires COURTLISTENER_API_TOKEN — free account token from courtlistener.com.
 */

const COURTLISTENER_TIMEOUT_MS = 12000
const COURTLISTENER_SEARCH = 'https://www.courtlistener.com/api/rest/v4/search/'

export interface LegalOpinion {
  id: string
  caseName: string
  court?: string
  dateFiled?: string
  year?: string
  citation?: string
  snippet?: string
  url: string
  docketNumber?: string
}

interface CourtListenerSearchHit {
  cluster_id?: number
  id?: number
  caseName?: string
  caseNameFull?: string
  court?: string
  court_citation_string?: string
  dateFiled?: string
  absolute_url?: string
  snippet?: string
  citation?: string[]
  docketNumber?: string
}

function token(): string | undefined {
  return process.env.COURTLISTENER_API_TOKEN?.trim() || undefined
}

export function isCourtListenerConfigured(): boolean {
  return Boolean(token())
}

/**
 * Search US opinions (type=o). Returns empty when the token is missing.
 */
export async function searchLegalOpinions(query: string, limit = 8): Promise<LegalOpinion[]> {
  const apiToken = token()
  if (!apiToken) return []

  const trimmed = query.replace(/\s+/g, ' ').trim()
  if (trimmed.length < 3) return []

  try {
    const params = new URLSearchParams({
      q: trimmed,
      type: 'o',
      order_by: 'score desc',
    })
    const res = await fetch(`${COURTLISTENER_SEARCH}?${params.toString()}`, {
      headers: {
        Authorization: `Token ${apiToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(COURTLISTENER_TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[courtlistener] search failed', res.status, body.slice(0, 120), trimmed.slice(0, 80))
      return []
    }
    const data = (await res.json()) as { results?: CourtListenerSearchHit[] }
    return (data.results ?? []).slice(0, limit).map((hit, i) => {
      const id = String(hit.cluster_id ?? hit.id ?? i)
      const path = hit.absolute_url?.startsWith('http')
        ? hit.absolute_url
        : hit.absolute_url
          ? `https://www.courtlistener.com${hit.absolute_url}`
          : `https://www.courtlistener.com/opinion/${id}/`
      const dateFiled = hit.dateFiled
      return {
        id,
        caseName: hit.caseNameFull || hit.caseName || `Opinion ${id}`,
        court: hit.court_citation_string || hit.court,
        dateFiled,
        year: dateFiled?.slice(0, 4),
        citation: hit.citation?.[0],
        snippet: hit.snippet?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        url: path,
        docketNumber: hit.docketNumber,
      }
    })
  } catch (err) {
    console.warn('[courtlistener] request error', err instanceof Error ? err.message : err)
    return []
  }
}
