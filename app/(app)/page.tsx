import { Suspense } from 'react'
import { CitationChat } from '@/components/chat/CitationChat'

export default function HomePage() {
  return (
    <Suspense fallback={<div className="pg-loading">Loading…</div>}>
      <CitationChat />
    </Suspense>
  )
}
