/** Default titles assigned when the user clicks an Add button (not AI-generated). */
export const DEFAULT_NEW_TITLES = new Set([
  'New point',
  'New subpoint',
  'New item',
  'New Section',
])

export function isDefaultNewTitle(value: string): boolean {
  return DEFAULT_NEW_TITLES.has(value.trim())
}

export function clearDefaultTitleOnFocus(
  value: string,
  onClear: () => void,
): void {
  if (isDefaultNewTitle(value)) onClear()
}
