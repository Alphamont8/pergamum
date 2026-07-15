'use client'

import Link from 'next/link'
import { useLibraryOptional } from '@/components/shell/LibraryContext'

export function BackLink({
  href = '/',
  label = 'Back',
  className = '',
}: {
  href?: string
  label?: string
  className?: string
}) {
  const library = useLibraryOptional()

  return (
    <Link
      href={href}
      className={`pg-back page-back ${className}`.trim()}
      onClick={() => {
        library?.closeLibrary()
      }}
    >
      <span className="pg-back__arrow" aria-hidden>
        ←
      </span>
      <span>{label}</span>
    </Link>
  )
}
