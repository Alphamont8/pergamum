import type { LucideIcon } from 'lucide-react'
import {
  Bookmark,
  Box,
  CircleHelp,
  Download,
  FolderOpen,
  Home,
  List,
  Trophy,
  Monitor,
  Moon,
  PanelLeft,
  PenLine,
  Settings,
  Sun,
  Zap,
} from 'lucide-react'
import type { ThemePreference } from '@/types'

/** Default sidebar nav icon size (Lucide `size` prop) */
export const NAV_ICON_SIZE = 20

export const NAV_ICON_STROKE = 1.5

const NAV_ICON_CLASS = 'app-sidebar__nav-icon'

export type SidebarIconId =
  | 'home'
  | 'projects'
  | 'upgrade'
  | 'leaderboard'
  | 'blueprint'
  | 'outline'
  | 'draft'
  | 'references'
  | 'export'
  | 'help'
  | 'settings'

const ICON_CLASS_MODIFIERS: Partial<Record<SidebarIconId, string>> = {
  upgrade: 'app-sidebar__nav-icon--upgrade',
}

const NAV_ICONS: Record<SidebarIconId, LucideIcon> = {
  home: Home,
  projects: FolderOpen,
  upgrade: Zap,
  leaderboard: Trophy,
  blueprint: Box,
  outline: List,
  draft: PenLine,
  references: Bookmark,
  export: Download,
  help: CircleHelp,
  settings: Settings,
}

interface NavIconProps {
  id: SidebarIconId
  size?: number
  className?: string
}

export function NavIcon({ id, size = NAV_ICON_SIZE, className }: NavIconProps) {
  const Icon = NAV_ICONS[id]
  if (!Icon) return null

  const classes = [NAV_ICON_CLASS, ICON_CLASS_MODIFIERS[id], className]
    .filter(Boolean)
    .join(' ')

  return (
    <Icon
      size={size}
      strokeWidth={NAV_ICON_STROKE}
      className={classes}
      aria-hidden
    />
  )
}

export function ThemeModeIcon({
  preference,
  size = NAV_ICON_SIZE,
  className,
}: {
  preference: ThemePreference
  size?: number
  className?: string
}) {
  const classes = [NAV_ICON_CLASS, className].filter(Boolean).join(' ')
  const props = {
    size,
    strokeWidth: NAV_ICON_STROKE,
    className: classes,
    'aria-hidden': true as const,
  }

  if (preference === 'system') {
    return <Monitor {...props} />
  }
  if (preference === 'light') {
    return <Sun {...props} />
  }
  return <Moon {...props} />
}

export function SidebarToggleIcon({
  size = NAV_ICON_SIZE,
  className,
}: {
  size?: number
  className?: string
}) {
  const classes = [NAV_ICON_CLASS, className].filter(Boolean).join(' ')
  return (
    <PanelLeft
      size={size}
      strokeWidth={NAV_ICON_STROKE}
      className={classes}
      aria-hidden
    />
  )
}
