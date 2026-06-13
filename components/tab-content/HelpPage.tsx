"use client"

import './TabContent.css'

export function HelpPage() {
  return (
    <div className="tab-content" style={{ padding: '20px 24px' }}>
      <h2 className="page-title">Help</h2>
      <p className="tab-content__lead">
        Guides for Blueprint, Outline, Draft, References, and using the AI assistant with your
        essay.
      </p>
      <p className="tab-content__placeholder">
        Documentation and support links will be added here.
      </p>
    </div>
  )
}
