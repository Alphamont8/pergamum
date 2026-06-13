'use client'

import './PublicationDateInput.css'

export interface PublicationDateFields {
  year: string
  month: string
  day: string
}

const MONTHS = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
]

export function parsePublicationDate(stored?: string): PublicationDateFields {
  if (!stored?.trim()) {
    return { year: '', month: '', day: '' }
  }
  const parts = stored.trim().split('-')
  if (parts.length === 1) {
    return { year: /^\d{4}$/.test(parts[0]) ? parts[0] : '', month: '', day: '' }
  }
  if (parts.length === 2) {
    return {
      year: /^\d{4}$/.test(parts[0]) ? parts[0] : '',
      month: /^\d{2}$/.test(parts[1]) ? parts[1] : '',
      day: '',
    }
  }
  return {
    year: /^\d{4}$/.test(parts[0]) ? parts[0] : '',
    month: parts[1] && /^\d{2}$/.test(parts[1]) ? parts[1] : '',
    day: parts[2] && /^\d{2}$/.test(parts[2]) ? parts[2] : '',
  }
}

export function serializePublicationDate(fields: PublicationDateFields): string {
  const { year, month, day } = fields
  if (!year && !month && !day) return ''
  if (year && month && day) return `${year}-${month}-${day.padStart(2, '0')}`
  if (year && month) return `${year}-${month}`
  if (year) return year
  if (month && day) return `${month}-${day}`
  if (month) return month
  if (day) return day
  return ''
}

interface PublicationDateInputProps {
  value?: string
  onChange: (serialized: string) => void
}

export function PublicationDateInput({ value, onChange }: PublicationDateInputProps) {
  const fields = parsePublicationDate(value)

  const update = (patch: Partial<PublicationDateFields>) => {
    onChange(serializePublicationDate({ ...fields, ...patch }))
  }

  return (
    <div className="publication-date-input">
      <select
        className="publication-date-input__select bp-input"
        value={fields.day}
        onChange={(e) => update({ day: e.target.value })}
        aria-label="Publication day"
      >
        <option value="">Day</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d).padStart(2, '0')}>
            {d}
          </option>
        ))}
      </select>
      <select
        className="publication-date-input__select bp-input"
        value={fields.month}
        onChange={(e) => update({ month: e.target.value })}
        aria-label="Publication month"
      >
        <option value="">Month</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        className="publication-date-input__select bp-input"
        value={fields.year}
        onChange={(e) => update({ year: e.target.value })}
        aria-label="Publication year"
      >
        <option value="">Year</option>
        {Array.from({ length: 126 }, (_, i) => 2026 - i).map((y) => (
          <option key={y} value={String(y)}>
            {y}
          </option>
        ))}
      </select>
    </div>
  )
}
