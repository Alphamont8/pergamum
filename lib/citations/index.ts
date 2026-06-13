/**
 * Public API for the unified citation system (Citation.js).
 * Import from '@/lib/citations' everywhere bibliography or in-text formatting is needed.
 */
export {
  formatBibliographyEntry,
  formatInTextCitation,
  formatBibliographyBatch,
  formatCitationsInDocumentOrder,
  clearCitationEngineCache,
} from './service'

export {
  classifySources,
  orderBibliographyIds,
  buildBibliographyEntries,
  buildBibliographyHygieneWarnings,
  getOutlineSourceIds,
  getCitedSourceIdsFromDraft,
  computeAverageReliability,
  countLowReliabilityCited,
} from './bibliography'

export type { BibliographyHygieneWarning } from './bibliography'

export {
  buildCitationSpanHtml,
  extractCitationSpansFromHtml,
  extractAllCitationSpans,
  citationSpansToInstances,
  reconcileDraftSections,
  replaceCitationTextInHtml,
  formatDraftCitationsAsync,
} from './reconcile'

export type { DraftCitationSpan } from './reconcile'

export { restyleDraftCitations } from './restyle'

export {
  convertCitationTokensInHtml,
  convertCitationTokensInPlain,
} from './draft-tokens'

export {
  buildPlainBibliography,
  buildMarkdownBibliography,
  buildBibTeX,
  buildRIS,
  buildDocxBibliography,
  copyBibliographyToClipboard,
  downloadBlob,
  downloadText,
} from './export'

export type { ExportBibliographyOptions, ExportScope } from './export'

export { sourceToCslItem, sourcesToCslItems } from './csl'
export type { CslItem } from './csl'

export { ensureCitationTemplates, resolveCitationTemplate } from './templates'
