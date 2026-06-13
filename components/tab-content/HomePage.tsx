'use client'

import './TabContent.css'

export function HomePage() {
  return (
    <div className="tab-content" style={{ padding: '20px 24px' }}>
      <h2 className="page-title">Home</h2>
      <p className="tab-content__lead">
        Your Pergamum dashboard — recent projects, progress, and quick actions.
      </p>
      <p className="tab-content__placeholder">Home dashboard coming soon.</p>
    </div>
  )
}
