"use client"

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'

const PLANS = ['Basic', 'Plus', 'Pro', 'Max'] as const

function BillingContent() {
  const searchParams = useSearchParams()
  const success = searchParams.get('success')
  const [loading, setLoading] = useState<string | null>(null)

  async function checkout(plan: string) {
    setLoading(plan)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  async function openPortal() {
    setLoading('portal')
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="billing-page">
      <Link href="/projects">← Projects</Link>
      <h1>Billing</h1>
      {success && <p>Subscription updated successfully.</p>}
      <p className="tab-content__lead">
        Choose a plan for higher word limits and frontier AI models.
      </p>

      <div className="billing-plans">
        {PLANS.map((plan) => (
          <div key={plan} className="billing-plan">
            <h3>{plan}</h3>
            {plan === 'Basic' ? (
              <p>Free tier</p>
            ) : (
              <button
                type="button"
                disabled={loading === plan}
                onClick={() => checkout(plan)}
              >
                {loading === plan ? 'Redirecting…' : `Upgrade to ${plan}`}
              </button>
            )}
          </div>
        ))}
      </div>

      <button type="button" onClick={openPortal} disabled={loading === 'portal'}>
        {loading === 'portal' ? 'Opening…' : 'Manage subscription'}
      </button>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="billing-page">Loading…</div>}>
      <BillingContent />
    </Suspense>
  )
}
