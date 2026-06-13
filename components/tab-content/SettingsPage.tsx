"use client"

import './TabContent.css'

export function SettingsPage() {
  return (
    <div className="tab-content" style={{ padding: '20px 24px' }}>
      <h2 className="page-title">Settings</h2>
      <p className="tab-content__lead">
        Global defaults for writing style, reading level, citation preferences, and custom CSL
        styles (Max plan).
      </p>
      <p className="tab-content__placeholder">
        App settings will mirror quick settings defaults for new projects.
      </p>
    </div>
  )
}
