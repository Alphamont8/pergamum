"use client"

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ProjectRow {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export default function ProjectsPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to load projects')
      return res.json() as Promise<{ projects: ProjectRow[] }>
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Essay' }),
      })
      if (!res.ok) throw new Error('Failed to create project')
      return res.json() as Promise<{ project: ProjectRow }>
    },
    onSuccess: ({ project }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      router.push(`/project/${project.id}/blueprint`)
    },
  })

  const projects = data?.projects ?? []

  return (
    <div className="projects-page">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Projects</h1>
          <p className="tab-content__lead">Browse and open your essay projects.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/settings">Settings</Link>
          <Link href="/billing">Billing</Link>
          <button type="button" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'New project'}
          </button>
        </div>
      </header>

      {isLoading && <p>Loading projects…</p>}
      {error && <p className="auth-card__error">{error.message}</p>}

      <div className="projects-page__grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/project/${p.id}/blueprint`} className="project-card">
            <h3>{p.title}</h3>
            <time dateTime={p.updated_at}>
              Updated {new Date(p.updated_at).toLocaleDateString()}
            </time>
          </Link>
        ))}
        {!isLoading && projects.length === 0 && (
          <p>No projects yet. Create your first essay to get started.</p>
        )}
      </div>
    </div>
  )
}
