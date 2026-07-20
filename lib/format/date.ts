const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function toDate(input: Date | string | number): Date | null {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return null
  return d
}

/** User-facing date, e.g. `20 Jul 2026`. */
export function formatAppDate(input: Date | string | number): string {
  const d = toDate(input)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** User-facing date and time, e.g. `20 Jul 2026 · 8:55 PM`. */
export function formatAppDateTime(input: Date | string | number): string {
  const d = toDate(input)
  if (!d) return ''
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${formatAppDate(d)} · ${timePart}`
}
