/**
 * Public API for the unified citation system (Citation.js).
 */
export {
  formatBibliographyEntry,
  formatInTextCitation,
  formatBibliographyBatch,
  formatCitationsInDocumentOrder,
  clearCitationEngineCache,
} from './service'

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

export { normalizeSourceForCitation } from './normalize'

export { ensureCitationTemplates, resolveCitationTemplate, getUsableCitationTemplate } from './templates'
