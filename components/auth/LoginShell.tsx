"use client"

import { AnimatedBackground } from '@/components/layout/AnimatedBackground'
import { WORKFLOW_NAV } from '@/constants/navigation'
import './LoginShell.css'

interface LoginShellProps {
  children: React.ReactNode
  /** Panel title inside the workspace area */
  title?: string
  lead?: string
}

export function LoginShell({
  children,
  title = 'Welcome back',
  lead = 'Sign in to save projects in the cloud, or continue without an account (Basic).',
}: LoginShellProps) {
  return (
    <div className="login-app">
      <AnimatedBackground />

      <div className="login-app__shell">
        <aside className="login-app__sidebar" aria-label="Workspace preview">
          <div className="login-app__sidebar-inner">
            <div className="login-app__sidebar-brand">
              <span className="login-app__sidebar-logo">Pergamum</span>
              <span className="login-app__sidebar-tier">Preview</span>
            </div>
            <div className="login-app__sidebar-divider" />
            <nav className="login-app__sidebar-nav">
              {WORKFLOW_NAV.map((item) => (
                <div
                  key={item.id}
                  className={`login-app__nav-link ${item.id === 'blueprint' ? 'login-app__nav-link--active' : ''}`}
                >
                  {item.label}
                </div>
              ))}
            </nav>
            <div className="login-app__sidebar-divider" />
            <p className="login-app__sidebar-foot">
              Blueprint → Outline → Draft → References
            </p>
          </div>
        </aside>

        <main className="login-app__workspace">
          <div className="login-app__workspace-panel">
            <div className="login-app__panel-header">
              <h1>{title}</h1>
              <p>{lead}</p>
            </div>
            <div className="login-app__panel-body">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
