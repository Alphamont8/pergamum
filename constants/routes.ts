import type { AppNavId } from './navigation'

export function projectBasePath(projectId: string, guest = false) {
  return guest ? `/guest/project/${projectId}` : `/project/${projectId}`
}

export function projectPath(projectId: string, segment: string, guest = false) {
  return `${projectBasePath(projectId, guest)}/${segment}`
}

export function isGuestPath(pathname: string) {
  return pathname.startsWith('/guest')
}

export function navIdToPath(
  projectId: string,
  navId: AppNavId,
  guest = false,
): string {
  if (navId === 'home') return '/home'
  if (navId === 'projects') return guest ? '/guest' : '/projects'
  if (navId === 'leaderboard') return '/leaderboard'
  if (navId === 'settings') return guest ? '/login' : '/settings'
  if (navId === 'help') return '/help'
  if (navId === 'billing') return guest ? '/login' : '/billing'
  if (navId === 'blueprint') return projectPath(projectId, 'blueprint', guest)
  if (navId === 'outline') return projectPath(projectId, 'outline', guest)
  if (navId === 'draft') return projectPath(projectId, 'draft', guest)
  if (navId === 'references') return projectPath(projectId, 'references', guest)
  if (navId === 'export') return projectPath(projectId, 'export', guest)
  return projectPath(projectId, 'blueprint', guest)
}

export function pathToNavId(pathname: string): AppNavId | null {
  if (pathname === '/home' || pathname.endsWith('/home')) return 'home'
  if (pathname === '/leaderboard' || pathname.endsWith('/leaderboard')) return 'leaderboard'
  if (pathname.includes('/blueprint')) return 'blueprint'
  if (pathname.includes('/outline')) return 'outline'
  if (pathname.includes('/draft')) return 'draft'
  if (pathname.includes('/references')) return 'references'
  if (pathname.includes('/export')) return 'export'
  return null
}
