import { PRO_MONTHLY_CITES, proHeadlineMonthlyPrice } from '@/lib/billing/plans'

export type ProUpsellFeature =
  | 'styles'
  | 'recency'
  | 'words'
  | 'suggestions'
  | 'export'
  | 'retry'
  | 'medical'
  | 'legal'
  | 'depth'
  | 'speed'
  | 'generic'

export interface ProUpsellCopy {
  title: string
  body: string
  highlight: string
  cta: string
}

export function proUpsellCopy(feature: ProUpsellFeature, detail?: string): ProUpsellCopy {
  const annualHighlight = `From $${proHeadlineMonthlyPrice()}/mo billed annually · ${PRO_MONTHLY_CITES} Cites every month.`
  switch (feature) {
    case 'styles':
      return {
        title: 'Unlock Every Referencing Style',
        body: detail
          ? `${detail} lives on Pro, alongside Chicago, IEEE, AMA, Nature, OSCOLA, Bluebook, and more.`
          : 'Pro opens the full style catalog, including Chicago, IEEE, AMA, Nature, OSCOLA, Bluebook, and more niche formats departments love.',
        highlight: 'Basic keeps APA, MLA, and Harvard. Pro covers the rest of campus.',
        cta: 'Compare Plans',
      }
    case 'recency':
      return {
        title: 'Filter Sources by Recency',
        body: 'Pro can prefer sources from the last 5 or 10 years. Handy when your brief asks for recent evidence.',
        highlight: 'Basic searches any year. Pro lets you tighten the window.',
        cta: 'Unlock Recency Filters',
      }
    case 'words':
      return {
        title: 'Cite Longer Drafts',
        body: detail
          ? `Basic is capped at ${detail} words per draft. Pro lifts the limit so longer papers and chapters fit in one go.`
          : 'Basic is capped at 1,000 words per draft. Pro lifts the limit so longer papers and chapters fit in one go.',
        highlight: 'Same pipeline, more room to write.',
        cta: 'Upgrade for Longer Drafts',
      }
    case 'suggestions':
      return {
        title: 'Get Writing Suggestions',
        body: 'Pro can gently flag wording that may not match the source, so you can tighten claims before you submit.',
        highlight: 'Suggestions stay off on Basic.',
        cta: 'Enable Suggestions With Pro',
      }
    case 'export':
      return {
        title: 'Export Your Draft',
        body: 'Pro downloads Word, PDF, BibTeX, and RIS so you can drop citations straight into Word, Zotero, or your LMS.',
        highlight: 'Basic can copy text. Pro packages the file.',
        cta: 'Unlock Exports',
      }
    case 'retry':
      return {
        title: 'Retry a Single Sentence',
        body: 'Not happy with one match? Pro can re-run that sentence alone before you open the draft, without starting over.',
        highlight: 'One Cite per retry. The rest of your draft stays put.',
        cta: 'Unlock Sentence Retry',
      }
    case 'medical':
      return {
        title: 'Search Medical Databases',
        body: 'Pro adds PubMed and related medical databases when your essay is about health or biomedicine.',
        highlight: annualHighlight,
        cta: 'Compare Plans',
      }
    case 'legal':
      return {
        title: 'Search Legal Databases',
        body: 'Pro adds US-focused legal databases for case law and policy writing. Pairs well with Bluebook and OSCOLA.',
        highlight: annualHighlight,
        cta: 'Compare Plans',
      }
    case 'depth':
      return {
        title: 'Deeper Verification',
        body: 'Pro checks more candidate sources per sentence and verifies matches more carefully before they land in your draft.',
        highlight: 'Fewer near-misses. Stronger confidence on hard claims.',
        cta: 'Get Deeper Verification',
      }
    case 'speed':
      return {
        title: 'Faster Generation',
        body: 'Pro runs more citation workers in parallel, so longer drafts finish sooner while you watch the Generation Theater.',
        highlight: 'About twice the parallel search power of Basic.',
        cta: 'Speed Up With Pro',
      }
    default:
      return {
        title: 'Upgrade to Pro',
        body: `Pro adds ${PRO_MONTHLY_CITES} Cites every month, deeper verification, faster generation, every referencing style, exports, and specialty databases. Or top up Cites once to try Pro features free for 14 days. We never auto-charge when a trial ends.`,
        highlight: annualHighlight,
        cta: 'Compare Plans',
      }
  }
}
