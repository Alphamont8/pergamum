import { redirect } from 'next/navigation'
import { getSessionUser, getUserTier } from '@/lib/auth/session'
import { loadProjectBundle } from '@/lib/projects/load'
import { ProjectWorkspace } from '@/components/project/ProjectWorkspace'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let user
  try {
    ;({ user } = await getSessionUser())
  } catch {
    redirect('/login?error=session')
  }
  if (!user) redirect('/login')

  let bundle
  try {
    bundle = await loadProjectBundle(id, user.id)
  } catch {
    redirect('/projects?error=load')
  }
  if (!bundle) redirect('/projects')

  const tier = await getUserTier(user.id)

  return (
    <>
      <ProjectWorkspace
        projectId={id}
        projectTitle={bundle.project.title}
        initialEssay={bundle.essay}
        subscriptionTier={tier}
      />
      {children}
    </>
  )
}
