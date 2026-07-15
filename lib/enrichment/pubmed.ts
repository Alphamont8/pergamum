import { CONTACT_EMAIL } from '@/lib/contact'

const EUTILS_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const PUBMED_TIMEOUT_MS = 9000

export interface PubMedArticle {
  pmid: string
  title?: string
  abstract?: string
  authors?: string[]
  journal?: string
  year?: string
  publicationDate?: string
  doi?: string
  volume?: string
  issue?: string
  pages?: string
  url: string
}

function eutilsParams(extra: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams({
    db: 'pubmed',
    tool: 'pergamum',
    email: process.env.OPENALEX_MAILTO ?? CONTACT_EMAIL,
    ...extra,
  })
  const apiKey = process.env.NCBI_API_KEY
  if (apiKey) params.set('api_key', apiKey)
  return params
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

function firstTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match) return undefined
  const inner = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return inner ? decodeXmlEntities(inner) : undefined
}

function allTags(block: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = re.exec(block))) {
    const inner = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (inner) out.push(decodeXmlEntities(inner))
  }
  return out
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function parseArticle(block: string): PubMedArticle | null {
  const pmid = firstTag(block, 'PMID')
  if (!pmid) return null

  const abstractParts = allTags(block, 'AbstractText')
  const authorBlocks = block.match(/<Author[^>]*>[\s\S]*?<\/Author>/gi) ?? []
  const authors = authorBlocks
    .map((a) => {
      const last = firstTag(a, 'LastName')
      const fore = firstTag(a, 'ForeName') ?? firstTag(a, 'Initials')
      const collective = firstTag(a, 'CollectiveName')
      if (collective) return collective
      return [fore, last].filter(Boolean).join(' ')
    })
    .filter(Boolean)

  const pubDateBlock = block.match(/<PubDate>[\s\S]*?<\/PubDate>/i)?.[0] ?? ''
  const year = firstTag(pubDateBlock, 'Year') ?? firstTag(block, 'Year')
  const monthRaw = firstTag(pubDateBlock, 'Month')
  const day = firstTag(pubDateBlock, 'Day')
  const month = monthRaw
    ? MONTHS[monthRaw.slice(0, 3).toLowerCase()] ?? (/^\d+$/.test(monthRaw) ? monthRaw.padStart(2, '0') : undefined)
    : undefined
  const publicationDate = year
    ? [year, month, day && month ? day.padStart(2, '0') : undefined].filter(Boolean).join('-')
    : undefined

  const doiMatch = block.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/i)
  const journalBlock = block.match(/<Journal>[\s\S]*?<\/Journal>/i)?.[0] ?? ''

  return {
    pmid,
    title: firstTag(block, 'ArticleTitle'),
    abstract: abstractParts.length ? abstractParts.join(' ').slice(0, 3000) : undefined,
    authors,
    journal: firstTag(journalBlock, 'Title') ?? firstTag(block, 'ISOAbbreviation'),
    year,
    publicationDate,
    doi: doiMatch ? decodeXmlEntities(doiMatch[1].trim()) : undefined,
    volume: firstTag(journalBlock, 'Volume'),
    issue: firstTag(journalBlock, 'Issue'),
    pages: firstTag(block, 'MedlinePgn'),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
  }
}

/**
 * Two-step PubMed search via NCBI E-utilities: esearch (relevance-ranked PMIDs)
 * then efetch (full article XML: title, abstract, authors, journal, DOI).
 */
export async function searchPubMed(query: string, limit = 8): Promise<PubMedArticle[]> {
  try {
    const searchParams = eutilsParams({
      term: query,
      retmode: 'json',
      retmax: String(limit),
      sort: 'relevance',
    })
    const searchRes = await fetch(`${EUTILS_BASE}/esearch.fcgi?${searchParams.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PUBMED_TIMEOUT_MS),
    })
    if (!searchRes.ok) {
      console.warn('[pubmed] esearch failed', searchRes.status, query.slice(0, 80))
      return []
    }
    const searchData = (await searchRes.json()) as { esearchresult?: { idlist?: string[] } }
    const ids = searchData.esearchresult?.idlist ?? []
    if (!ids.length) return []

    const fetchParams = eutilsParams({
      id: ids.join(','),
      retmode: 'xml',
      rettype: 'abstract',
    })
    const fetchRes = await fetch(`${EUTILS_BASE}/efetch.fcgi?${fetchParams.toString()}`, {
      signal: AbortSignal.timeout(PUBMED_TIMEOUT_MS),
    })
    if (!fetchRes.ok) {
      console.warn('[pubmed] efetch failed', fetchRes.status)
      return []
    }
    const xml = await fetchRes.text()
    const blocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/gi) ?? []
    return blocks.map(parseArticle).filter(Boolean) as PubMedArticle[]
  } catch (err) {
    console.warn('[pubmed] request error', err instanceof Error ? err.message : err)
    return []
  }
}
