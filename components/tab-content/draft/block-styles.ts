/** Standard first-line indent width. */
export const INDENT_STEP_PX = 40

export interface BlockStyleAttrs {
  firstLineIndent?: number
}

export function buildBlockStyle(attrs: BlockStyleAttrs): string | undefined {
  const fIndent = attrs.firstLineIndent ?? 0
  if (fIndent > 0) return `text-indent:${fIndent * INDENT_STEP_PX}px`
  return undefined
}

export function parseFirstLineIndent(value: string | null | undefined): number {
  if (!value) return 0
  const px = Number.parseInt(value, 10)
  if (Number.isNaN(px)) return 0
  return px >= INDENT_STEP_PX / 2 ? 1 : 0
}
