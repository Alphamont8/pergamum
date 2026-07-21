export type ThemePreference = 'system' | 'light' | 'dark'

export type PlanTier = 'basic' | 'plus' | 'pro'

export type BillingInterval = 'month' | 'year'

export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused'

export type CitationStyle = 'APA' | 'MLA' | 'Chicago' | 'Harvard'

export type ReferencingStyleId =
  | 'none'
  | 'apa'
  | 'mla'
  | 'harvard'
  | 'chicago-notes'
  | 'chicago-author-date'
  | 'ieee'
  | 'vancouver'
  | 'bluebook'
  | string

export type SourceKind =
  | 'journal-article'
  | 'book'
  | 'book-chapter'
  | 'preprint'
  | 'report'
  | 'webpage'
  | 'thesis'
  | 'legal-case'
  | 'other'

export type SourceType = 'primary' | 'secondary'

export type EnrichmentStatus = 'pending' | 'enriching' | 'enriched' | 'failed'

export type ReliabilityBand = 'strong' | 'good' | 'fair' | 'caution'

export interface SourceVenue {
  name?: string
  type?: string
  publisher?: string
  issn?: string
}

export interface SourceBiblio {
  volume?: string
  issue?: string
  pages?: string
}

export interface SourceAuthorship {
  name: string
  /** When true, treat as an organization/team literal (not a personal name). */
  literal?: boolean
  orcid?: string
  hIndex?: number
  institutions?: string[]
}

export interface SourceOpenAccess {
  isOA: boolean
  status?: string
  oaUrl?: string
}

export interface SourceExaMeta {
  favicon?: string
  image?: string
  siteName?: string
  publishedDate?: string
  highlights?: string[]
}

export interface SourceEnrichment {
  status: EnrichmentStatus
  enrichedAt?: number
  error?: string
}

export interface ReliabilitySubscore {
  score: number
  rationale: string
}

export interface SourceReliability {
  overall: number
  band: ReliabilityBand
  subscores: {
    peerReview: ReliabilitySubscore
    authorCredibility: ReliabilitySubscore
    recency: ReliabilitySubscore
    objectivity: ReliabilitySubscore
  }
  evaluatedAt?: number
  flags?: string[]
}

export interface SourceSearchResult {
  title: string
  url: string
  summary: string
  type?: SourceType
  authors?: string
  year?: string
  publisher?: string
  quotes?: string[]
}

export interface SourceRecord {
  id: string
  title: string
  url?: string
  fileName?: string
  type: SourceType
  summary?: string
  authors?: string
  year?: string
  publisher?: string
  doi?: string
  openAlexId?: string
  abstract?: string
  publicationDate?: string
  venue?: SourceVenue
  biblio?: SourceBiblio
  authorships?: SourceAuthorship[]
  citedByCount?: number
  fwci?: number
  openAccess?: SourceOpenAccess
  topics?: string[]
  sourceKind?: SourceKind
  exa?: SourceExaMeta
  enrichment?: SourceEnrichment
  reliability?: SourceReliability
}

export interface CitationInstance {
  id: string
  sourceId: string
  style: CitationStyle
  inText: string
  sectionId: string
  locator?: string
  citationNumber?: number
}

export type BibliographyGroup = 'cited' | 'outline' | 'unused'

export interface BibliographyEntry {
  sourceId: string
  group: BibliographyGroup
  formatted: string
  citationIds: string[]
  citationCount: number
  citationNumber?: number
}

export type CiteLedgerKind =
  | 'purchase'
  | 'subscription'
  | 'referral'
  | 'ad'
  | 'spend'
  | 'grant'

export type GenerationStatus =
  | 'analyzing'
  | 'quoted'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type SourceRecency = 'any' | '10y' | '5y'

export type SourceTier = 'any' | 'academic'

export interface GenerationSettings {
  styleId: ReferencingStyleId
  inText: boolean
  suggestCorrections: boolean
  recency: SourceRecency
  sourceTier: SourceTier
  /** Set server-side during analysis; routes medical essays through the medical database. */
  medical?: boolean
  /** Set server-side during analysis; routes legal essays through the US legal database (Pro). */
  legal?: boolean
  /**
   * Optional user-pasted source links / DOIs. When set, the pipeline prefers these
   * records over discovery search for matching claims.
   */
  sourceLinks?: string
}

export interface Profile {
  id: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  schoolId: string | null
  defaultStyle: ReferencingStyleId
  defaultInText: boolean
  defaultSuggestCorrections: boolean
  defaultRecency: SourceRecency
  defaultSourceTier: SourceTier
  themePreference: ThemePreference
  referralCode: string
  /** Total spendable Cites (permanent + remaining Pro monthly allotment). */
  citesBalance: number
  /** Pack / referral / signup pool — never expires. */
  permanentCitesBalance: number
  /** Remaining Pro monthly allotment — resets each grant; clears when Pro ends. */
  proCitesBalance: number
  bibliographiesCount: number
  onboardingComplete: boolean
  billingCustomerId: string | null
  planTier: PlanTier
  proTrialStartedAt: string | null
  proTrialEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Subscription {
  id: string
  userId: string
  billingSubscriptionId: string
  billingCustomerId: string
  planTier: Exclude<PlanTier, 'basic'>
  billingInterval: BillingInterval
  status: SubscriptionStatus
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  nextCitesGrantAt: string | null
  createdAt: string
  updatedAt: string
}

export interface School {
  id: string
  name: string
  country: string | null
  domain: string | null
  webPage: string | null
}

export type LeaderboardScope = 'global' | 'school' | 'friends'
export type LeaderboardMetric = 'sentences' | 'bibliographies' | 'cites_earned'
