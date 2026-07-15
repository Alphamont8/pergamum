import type { SourceRecord } from '@/types'
import { fetchCrossrefWork, searchCrossrefByAuthorYear } from '@/lib/enrichment/crossref'
import {
  lookupOpenAlexByDoi,
  openAlexWorkToPatch,
  searchOpenAlexByAuthorYear,
  type OpenAlexWork,
} from '@/lib/enrichment/openalex'
import { enrichFromDoi } from '@/lib/enrichment/doi'

export type ExistingCitationForm = 'parenthetical' | 'narrative' | 'doi' | 'numeric'

/** Citation already present in the pasted draft sentence. */
export interface ExistingCitation {
  raw: string
  form: ExistingCitationForm
  /** Surname / display names in citation order. */
  authors: string[]
  year?: string
  doi?: string
  /** Numeric marker like [1] — cannot resolve without a bibliography list. */
  number?: number
}

const DOI_RE = /\b(10\.\d{4,}(?:\.\d+)*\/[^\s)\]>"']+)/i
const DOI_URL_RE = /https?:\/\/(?:dx\.)?doi\.org\/(10\.\d{4,}(?:\.\d+)*\/[^\s)\]>"']+)/i

/** (Smith, 2020) / (Smith & Jones, 2020) / (Smith et al., 2020) / (Smith, Jones, & Lee, 2019) */
const PARENTHETICAL_RE =
  /\(([A-Z][\p{L}'’.-]+(?:\s+(?:and|&)\s+[A-Z][\p{L}'’.-]+|(?:\s*,\s*[A-Z][\p{L}'’.-]+)+(?:\s*,?\s*(?:and|&)\s+[A-Z][\p{L}'’.-]+)?|\s+et\s+al\.?)?),\s*((?:19|20)\d{2}[a-z]?)(?:[;,][^)]*)?\)/u

/** Smith (2020) / Smith and Jones (2020) / Smith et al. (2020) */
const NARRATIVE_RE =
  /\b([A-Z][\p{L}'’.-]+(?:\s+(?:and|&)\s+[A-Z][\p{L}'’.-]+|\s+et\s+al\.?)?)\s*\(((?:19|20)\d{2}[a-z]?)\)/u

/** Trailing author–year / bracket cite near end of sentence (for double-cite guard). */
const TRAILING_CITE_RE =
  /(?:\([A-Z][^)]{0,80}?(?:19|20)\d{2}[a-z]?[^)]{0,40}\)|\[[0-9]+(?:,\s*[0-9]+)*\]|\(\d+\))\s*[.!?…]?\s*$/u

function splitAuthorNames(authorBlob: string): string[] {
  const cleaned = authorBlob
    .replace(/\s+et\s+al\.?/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return []
  return cleaned
    .split(/\s*(?:,|&| and )\s*/i)
    .map((a) => a.trim())
    .filter((a) => a.length >= 2 && !/^(and|&)$/i.test(a))
    .slice(0, 4)
}

function normalizeDoi(raw: string): string {
  return raw.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/[.,;:]+$/, '').trim()
}

/**
 * Deterministic extraction of in-text citations already present in a sentence.
 * Prefers DOI, then parenthetical, then narrative author–year.
 */
export function extractExistingCitation(sentence: string): ExistingCitation | null {
  const doiUrl = sentence.match(DOI_URL_RE)
  if (doiUrl?.[1]) {
    const doi = normalizeDoi(doiUrl[1])
    return { raw: doiUrl[0], form: 'doi', authors: [], doi }
  }
  const doiMatch = sentence.match(DOI_RE)
  if (doiMatch?.[1]) {
    const doi = normalizeDoi(doiMatch[1])
    return { raw: doiMatch[0], form: 'doi', authors: [], doi }
  }

  const parenthetical = sentence.match(PARENTHETICAL_RE)
  if (parenthetical) {
    const authors = splitAuthorNames(parenthetical[1])
    const year = parenthetical[2]?.replace(/[a-z]$/i, '')
    if (authors.length && year) {
      return {
        raw: parenthetical[0],
        form: 'parenthetical',
        authors,
        year,
      }
    }
  }

  const narrative = sentence.match(NARRATIVE_RE)
  if (narrative) {
    const authors = splitAuthorNames(narrative[1])
    const year = narrative[2]?.replace(/[a-z]$/i, '')
    if (authors.length && year) {
      return {
        raw: narrative[0],
        form: 'narrative',
        authors,
        year,
      }
    }
  }

  return null
}

/** Merge analyze LLM fields with regex parse (DOI / authors / year). */
export function mergeExistingCitation(
  fromAnalyze: Partial<ExistingCitation> | null | undefined,
  sentence: string,
): ExistingCitation | null {
  const parsed = extractExistingCitation(sentence)
  if (!fromAnalyze && !parsed) return null

  const authors = [
    ...(fromAnalyze?.authors ?? []),
    ...(parsed?.authors ?? []),
  ]
    .map((a) => a.trim())
    .filter(Boolean)

  const uniqueAuthors = [...new Set(authors)].slice(0, 4)
  const doi = fromAnalyze?.doi
    ? normalizeDoi(fromAnalyze.doi)
    : parsed?.doi
  const year = (fromAnalyze?.year ?? parsed?.year)?.replace(/[a-z]$/i, '')
  const form =
    fromAnalyze?.form ??
    parsed?.form ??
    (doi ? 'doi' : uniqueAuthors.length ? 'parenthetical' : 'parenthetical')

  if (!doi && (!uniqueAuthors.length || !year)) {
    return parsed
  }

  return {
    raw: fromAnalyze?.raw?.trim() || parsed?.raw || uniqueAuthors.join(', ') + (year ? ` ${year}` : ''),
    form: form as ExistingCitationForm,
    authors: uniqueAuthors,
    year,
    doi,
    number: fromAnalyze?.number ?? parsed?.number,
  }
}

export function sentenceHasExistingInTextCitation(sentence: string): boolean {
  if (extractExistingCitation(sentence)) return true
  return TRAILING_CITE_RE.test(sentence.trim())
}

function surname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts[parts.length - 1] ?? name).toLowerCase().replace(/[^a-z\p{L}'’-]/gu, '')
}

function authorMatchesRecord(authors: string[], record: SourceRecord): boolean {
  if (!authors.length) return true
  const blob = [
    record.authors ?? '',
    ...(record.authorships?.map((a) => a.name) ?? []),
  ]
    .join(' ')
    .toLowerCase()
  if (!blob.trim()) return false
  const primary = surname(authors[0])
  if (!primary || primary.length < 2) return false
  return blob.includes(primary)
}

function yearMatchesRecord(year: string | undefined, record: SourceRecord): boolean {
  if (!year) return true
  const y = year.slice(0, 4)
  const ry = (record.year ?? record.publicationDate ?? '').slice(0, 4)
  return !ry || ry === y
}

function workToSourceRecord(work: OpenAlexWork, tag: string): SourceRecord {
  const patch = openAlexWorkToPatch(work)
  return {
    id: `oa-cite-${tag}-${work.id}`,
    title: patch.title ?? work.display_name ?? 'Untitled',
    type: 'secondary',
    ...patch,
  }
}

function patchToSourceRecord(patch: Partial<SourceRecord>, tag: string): SourceRecord | null {
  if (!patch.title && !patch.doi) return null
  return {
    id: `cr-cite-${tag}-${patch.doi ?? patch.title?.slice(0, 24) ?? 'x'}`,
    title: patch.title ?? 'Untitled',
    type: 'secondary',
    ...patch,
  }
}

function scoreCandidate(cite: ExistingCitation, record: SourceRecord): number {
  let score = 0
  if (cite.doi && record.doi) {
    const a = normalizeDoi(cite.doi).toLowerCase()
    const b = normalizeDoi(record.doi).toLowerCase()
    if (a === b) score += 10
  }
  if (yearMatchesRecord(cite.year, record)) score += 3
  else score -= 5
  if (authorMatchesRecord(cite.authors, record)) score += 4
  else score -= 4
  if (record.abstract || record.summary) score += 1
  if (record.venue?.name) score += 0.5
  return score
}

/**
 * Resolve a draft's existing in-text citation to a bibliographic SourceRecord.
 * Tries DOI first, then Crossref author+year, then OpenAlex author+year.
 */
export async function resolveExistingCitation(
  cite: ExistingCitation,
): Promise<SourceRecord | null> {
  if (cite.form === 'numeric' && !cite.doi && !cite.authors.length) {
    return null
  }

  const tag = [
    cite.authors[0] ?? 'anon',
    cite.year ?? 'y',
    (cite.doi ?? '').slice(0, 12),
  ]
    .join('-')
    .replace(/\s+/g, '')
    .slice(0, 48)

  const candidates: SourceRecord[] = []

  if (cite.doi) {
    const oa = await lookupOpenAlexByDoi(cite.doi)
    if (oa) candidates.push(workToSourceRecord(oa, tag))
    const cr = await fetchCrossrefWork(cite.doi)
    const fromCr = cr ? patchToSourceRecord(cr, tag) : null
    if (fromCr) candidates.push(fromCr)
  }

  if (cite.authors.length && cite.year) {
    const primary = cite.authors[0]
    const [crossrefHits, openAlexHits] = await Promise.all([
      searchCrossrefByAuthorYear(primary, cite.year, {
        coauthors: cite.authors.slice(1),
      }),
      searchOpenAlexByAuthorYear(primary, cite.year),
    ])
    for (const hit of crossrefHits) {
      const rec = patchToSourceRecord(hit, tag)
      if (rec) candidates.push(rec)
    }
    for (const work of openAlexHits) {
      candidates.push(workToSourceRecord(work, `${tag}-oa`))
    }
  }

  if (!candidates.length) return null

  const scored = candidates
    .map((record) => ({ record, score: scoreCandidate(cite, record) }))
    .filter((c) => c.score >= 3)
    .sort((a, b) => b.score - a.score)

  let best = scored[0]?.record
  if (!best) return null

  if (best.doi) {
    try {
      best = await enrichFromDoi(best)
    } catch {
      /* keep as-is */
    }
  }

  if (!authorMatchesRecord(cite.authors, best) && !cite.doi) return null
  if (!yearMatchesRecord(cite.year, best) && !cite.doi) return null

  return best
}
