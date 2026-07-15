'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GenerationView } from '@/components/chat/GenerationView'
import '@/components/chat/chat.css'

interface GenerationRow {
  id: string
  title: string | null
  essay_input: string
  status: string
  cites_required: number
  cites_spent: number
  pinned?: boolean
  pinned_at?: string | null
  result: {
    essay?: string
    originalEssay?: string
    bibliography?: string[]
    citations?: Array<{
      index: number
      sentence: string
      status: string
      inText?: string
      correction?: string | null
      bibliography?: string
      title?: string
      errorMessage?: string
    }>
  } | null
  created_at: string
  error_message?: string | null
}

export function GenerationViewLoader({ id }: { id: string }) {
  const router = useRouter()
  const [generation, setGeneration] = useState<GenerationRow | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    setGeneration(null)
    setMissing(false)

    void (async () => {
      const res = await fetch(`/api/generations/${id}`, { cache: 'no-store' })
      if (cancelled) return
      if (res.status === 401) {
        router.replace(`/login?redirect=${encodeURIComponent(`/c/${id}`)}&error=session`)
        return
      }
      if (res.status === 404) {
        setMissing(true)
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as { generation: GenerationRow }
      if (cancelled) return

      const status = data.generation.status
      if (status === 'quoted' || status === 'analyzing') {
        router.replace(`/?resume=${encodeURIComponent(id)}`)
        return
      }
      if (status === 'generating') {
        router.replace(`/?theater=${encodeURIComponent(id)}`)
        return
      }

      setGeneration(data.generation)
    })()

    return () => {
      cancelled = true
    }
  }, [id, router])

  if (missing) {
    return (
      <div className="pg-container generation-page">
        <p className="pg-muted">
          We couldn&apos;t find that draft. It may have been deleted, or the link might be off.
        </p>
      </div>
    )
  }

  if (!generation) {
    return <div className="generation-page generation-page--blank" aria-busy="true" />
  }

  return <GenerationView generation={generation} />
}
