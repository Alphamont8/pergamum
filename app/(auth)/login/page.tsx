"use client"

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'
import './login-portal.css'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function enterWorkspace() {
    setLoading(true)
    try {
      await fetch('/api/guest/start', { method: 'POST' })
      router.push(`/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`)
      router.refresh()
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="login-portal">
      <div className="login-portal__card">
        <h1>Pergamum</h1>
        <p className="login-portal__lead">
          Sign-in is temporarily unavailable. Continue as a guest to use the workspace.
        </p>
        <button
          type="button"
          className="login-portal__button"
          onClick={enterWorkspace}
          disabled={loading}
        >
          {loading ? 'Opening…' : 'Open workspace'}
        </button>
      </div>
    </div>
  )
}
