import type { PubMedArticle } from '@/lib/enrichment/pubmed'
import { searchPubMed } from '@/lib/enrichment/pubmed'

const EUROPE_PMC_TIMEOUT_MS = 9000
const EUROPE_PMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
const CLINICAL_TRIALS_TIMEOUT_MS = 9000
const CLINICAL_TRIALS_BASE = 'https://clinicaltrials.gov/api/v2/studies'

export type MedicalArticle = PubMedArticle & {
  source: 'pubmed' | 'europepmc' | 'clinicaltrials'
}

interface EuropePmcHit {
  id?: string
  source?: string
  pmid?: string
  doi?: string
  title?: string
  authorString?: string
  journalTitle?: string
  pubYear?: string
  firstPublicationDate?: string
  abstractText?: string
  pageInfo?: string
  journalVolume?: string
  issue?: string
}

const TRIAL_SIGNAL_RE =
  /\b(clinical\s+trial|randomized|randomised|phase\s+[i1]{1,3}|nct\d{8}|placebo[- ]controlled|double[- ]blind)\b/i

export function looksLikeClinicalTrialClaim(...texts: string[]): boolean {
  return texts.some((t) => TRIAL_SIGNAL_RE.test(t))
}

async function searchEuropePmc(query: string, limit = 8): Promise<MedicalArticle[]> {
  try {
    const params = new URLSearchParams({
      query,
      format: 'json',
      resultType: 'core',
      pageSize: String(limit),
    })
    const res = await fetch(`${EUROPE_PMC_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(EUROPE_PMC_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('[europepmc] search failed', res.status, query.slice(0, 80))
      return []
    }
    const data = (await res.json()) as {
      resultList?: { result?: EuropePmcHit[] }
    }
    const hits = data.resultList?.result ?? []
    return hits
      .map((hit): MedicalArticle | null => {
        const pmid = hit.pmid || (hit.source === 'MED' ? hit.id : undefined)
        const doi = hit.doi?.replace(/^https?:\/\/doi\.org\//i, '')
        if (!pmid && !doi && !hit.id) return null
        const authors = hit.authorString
          ? hit.authorString.split(/,\s*|;\s*/).map((a) => a.trim()).filter(Boolean)
          : undefined
        const id = pmid || hit.id || doi!
        return {
          source: 'europepmc',
          pmid: pmid || id,
          title: hit.title,
          abstract: hit.abstractText?.slice(0, 3000),
          authors,
          journal: hit.journalTitle,
          year: hit.pubYear || hit.firstPublicationDate?.slice(0, 4),
          publicationDate: hit.firstPublicationDate,
          doi,
          volume: hit.journalVolume,
          issue: hit.issue,
          pages: hit.pageInfo,
          url: doi
            ? `https://doi.org/${doi}`
            : pmid
              ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
              : `https://europepmc.org/article/${hit.source || 'MED'}/${id}`,
        }
      })
      .filter(Boolean) as MedicalArticle[]
  } catch (err) {
    console.warn('[europepmc] request error', err instanceof Error ? err.message : err)
    return []
  }
}

interface ClinicalTrialsStudy {
  protocolSection?: {
    identificationModule?: {
      nctId?: string
      briefTitle?: string
      officialTitle?: string
      organization?: { fullName?: string }
    }
    statusModule?: {
      startDateStruct?: { date?: string }
      completionDateStruct?: { date?: string }
      lastUpdatePostDateStruct?: { date?: string }
    }
    descriptionModule?: {
      briefSummary?: string
    }
    sponsorCollaboratorsModule?: {
      leadSponsor?: { name?: string }
    }
  }
}

async function searchClinicalTrials(query: string, limit = 5): Promise<MedicalArticle[]> {
  try {
    const params = new URLSearchParams({
      'query.term': query,
      pageSize: String(limit),
      format: 'json',
      fields:
        'protocolSection.identificationModule,protocolSection.statusModule,protocolSection.descriptionModule,protocolSection.sponsorCollaboratorsModule',
    })
    const res = await fetch(`${CLINICAL_TRIALS_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(CLINICAL_TRIALS_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn('[clinicaltrials] search failed', res.status, query.slice(0, 80))
      return []
    }
    const data = (await res.json()) as { studies?: ClinicalTrialsStudy[] }
    return (data.studies ?? [])
      .map((study): MedicalArticle | null => {
        const id = study.protocolSection?.identificationModule
        const nctId = id?.nctId
        if (!nctId) return null
        const status = study.protocolSection?.statusModule
        const date =
          status?.completionDateStruct?.date ||
          status?.startDateStruct?.date ||
          status?.lastUpdatePostDateStruct?.date
        const sponsor =
          study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name ||
          id?.organization?.fullName
        return {
          source: 'clinicaltrials',
          pmid: nctId,
          title: id?.briefTitle || id?.officialTitle || nctId,
          abstract: study.protocolSection?.descriptionModule?.briefSummary?.slice(0, 3000),
          authors: sponsor ? [sponsor] : undefined,
          journal: 'ClinicalTrials.gov',
          year: date?.slice(0, 4),
          publicationDate: date,
          url: `https://clinicaltrials.gov/study/${nctId}`,
        }
      })
      .filter(Boolean) as MedicalArticle[]
  } catch (err) {
    console.warn('[clinicaltrials] request error', err instanceof Error ? err.message : err)
    return []
  }
}

function articleKey(a: MedicalArticle): string {
  if (a.doi) return `doi:${a.doi.toLowerCase()}`
  if (a.source === 'clinicaltrials') return `nct:${a.pmid.toLowerCase()}`
  return `pmid:${a.pmid}`
}

/**
 * Pro Medical Database: PubMed first, then Europe PMC only when thin,
 * plus ClinicalTrials.gov when the claim looks trial-related.
 * No API keys required (NCBI_API_KEY optional for higher PubMed rate limits).
 */
export async function searchMedicalDatabase(
  query: string,
  options?: { limit?: number; includeTrials?: boolean },
): Promise<MedicalArticle[]> {
  const limit = options?.limit ?? 8
  const includeTrials = options?.includeTrials === true
  const thinThreshold = 5

  const seen = new Set<string>()
  const out: MedicalArticle[] = []

  const pushAll = (articles: MedicalArticle[]) => {
    for (const article of articles) {
      const key = articleKey(article)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(article)
    }
  }

  const pubmed = await searchPubMed(query, limit).then((rows) =>
    rows.map((r): MedicalArticle => ({ ...r, source: 'pubmed' })),
  )
  pushAll(pubmed)

  if (out.length < thinThreshold) {
    pushAll(await searchEuropePmc(query, limit))
  }

  if (includeTrials) {
    pushAll(await searchClinicalTrials(query, Math.min(5, limit)))
  }

  return out.slice(0, Math.max(limit, includeTrials ? limit + 3 : limit))
}
