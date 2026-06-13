"use client"

import { useEffect, useState } from 'react'
import {
  SIDEBAR_FOOTER_NAV,
  WORKFLOW_NAV,
  type AppNavId,
} from '../../constants/navigation'
import type { SubscriptionTier, ThemePreference } from '../../types'
import { PlanSelector } from './PlanSelector'
import { themePreferenceLabel } from '@/lib/theme'
import {
  NavIcon,
  NAV_ICON_SIZE,
  SidebarToggleIcon,
  ThemeModeIcon,
  type SidebarIconId,
} from './NavIcon'
import './AppSidebar.css'
import './PlanSelector.css'

const COLLAPSED_KEY = 'pergamum-sidebar-collapsed'

const TOP_NAV: { id: AppNavId | 'upgrade'; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'projects', label: 'Projects' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'upgrade', label: 'Upgrade' },
]

interface AppSidebarProps {
  activeNavId: AppNavId
  activePlan: SubscriptionTier
  onPlanChange: (plan: SubscriptionTier) => void
  themePreference: ThemePreference
  onNavigate: (navId: AppNavId) => void
  onCycleTheme: () => void
  onUpgrade?: () => void
}

function NavButton({
  iconId,
  label,
  active,
  collapsed,
  onClick,
  title,
}: {
  iconId: SidebarIconId
  label: string
  active?: boolean
  collapsed: boolean
  onClick: () => void
  title?: string
}) {
  return (
    <button
      type="button"
      className={`app-sidebar__link ${active ? 'app-sidebar__link--active' : ''}`}
      onClick={onClick}
      title={collapsed ? label : title}
    >
      <span className="app-sidebar__link-icon">
        <NavIcon id={iconId} />
      </span>
      {!collapsed && <span className="app-sidebar__link-label">{label}</span>}
    </button>
  )
}

export function AppSidebar({
  activeNavId,
  activePlan,
  onPlanChange,
  themePreference,
  onNavigate,
  onCycleTheme,
  onUpgrade,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const handleTop = (id: AppNavId | 'upgrade') => {
    if (id === 'upgrade') {
      onUpgrade?.()
      return
    }
    onNavigate(id)
  }

  return (
    <aside
      className={`app-sidebar ${collapsed ? 'app-sidebar--collapsed' : ''}`}
      aria-label="Main navigation"
    >
      <div className="app-sidebar__main">
        <div className="app-sidebar__header">
          <div className="app-sidebar__brand">
            {!collapsed && (
              <>
                <span className="app-sidebar__logo">Pergamum</span>
                <PlanSelector value={activePlan} onChange={onPlanChange} />
              </>
            )}
          </div>
          <button
            type="button"
            className="app-sidebar__collapse-btn"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <SidebarToggleIcon />
          </button>
        </div>

        <div className="app-sidebar__top-actions">
          {TOP_NAV.map((item) => (
            <NavButton
              key={item.id}
              iconId={item.id as SidebarIconId}
              label={item.label}
              collapsed={collapsed}
              active={item.id !== 'upgrade' && activeNavId === item.id}
              onClick={() => handleTop(item.id)}
            />
          ))}
        </div>

        <div className="app-sidebar__divider" />

        {!collapsed && <p className="app-sidebar__section-label">Workflow</p>}
        <nav className="app-sidebar__nav" aria-label="Workflow">
          {WORKFLOW_NAV.map((item) => (
            <NavButton
              key={item.id}
              iconId={item.id as SidebarIconId}
              label={item.label}
              collapsed={collapsed}
              active={activeNavId === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>
      </div>

      {!collapsed && <div className="app-sidebar__divider app-sidebar__divider--footer" />}

      <div className="app-sidebar__footer">
        {SIDEBAR_FOOTER_NAV.map((item) => (
          <NavButton
            key={item.id}
            iconId={item.id as SidebarIconId}
            label={item.label}
            collapsed={collapsed}
            active={activeNavId === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
        <button
          type="button"
          className={`app-sidebar__theme-toggle ${collapsed ? 'app-sidebar__theme-toggle--collapsed' : ''}`}
          onClick={onCycleTheme}
          aria-label={`Theme: ${themePreferenceLabel(themePreference)}. Click to change.`}
          title={collapsed ? themePreferenceLabel(themePreference) : undefined}
        >
          <span className="app-sidebar__theme-toggle-icon">
            <ThemeModeIcon preference={themePreference} size={NAV_ICON_SIZE} />
          </span>
          {!collapsed && (
            <span className="app-sidebar__theme-toggle-label">
              {themePreferenceLabel(themePreference)}
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
