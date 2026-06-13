"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CitationStyle } from '@/types'
import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export default function SettingsPage() {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('APA')
  const [writingStyle, setWritingStyle] = useState('Academic')
  const [message, setMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<{ used: number; limit: number | null; remaining: number | null } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (profile) {
        const p = profile as ProfileRow
        setDisplayName(p.display_name ?? '')
        setCitationStyle((p.default_citation_style as CitationStyle) ?? 'APA')
        setWritingStyle(p.default_writing_style ?? 'Academic')
      }
      try {
        const usageRes = await fetch('/api/usage')
        if (usageRes.ok) setUsage(await usageRes.json())
      } catch {
        /* optional */
      }
      setLoading(false)
    }
    load()
  }, [])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        default_citation_style: citationStyle,
        default_writing_style: writingStyle,
        preferred_model: 'deepseek',
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    setMessage(error ? error.message : 'Settings saved.')
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setMessage(error ? error.message : 'Password updated.')
    setPassword('')
  }

  if (loading) return <div className="settings-page"><p>Loading…</p></div>

  return (
    <div className="settings-page">
      <header style={{ marginBottom: '2rem' }}>
        <Link href="/projects">← Projects</Link>
        <h1>Settings</h1>
        <p className="tab-content__lead">Defaults for new projects and account preferences.</p>
      </header>

      {message && <p>{message}</p>}

      <form className="settings-page__section" onSubmit={saveProfile}>
        <h2>Profile</h2>
        <div className="settings-page__field">
          <label>Email</label>
          <input type="email" value={email} disabled />
        </div>
        <div className="settings-page__field">
          <label>Display name</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div className="settings-page__field">
          <label>Default citation style</label>
          <select
            value={citationStyle}
            onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
          >
            <option value="APA">APA</option>
            <option value="MLA">MLA</option>
            <option value="Chicago">Chicago</option>
            <option value="Harvard">Harvard</option>
          </select>
        </div>
        <div className="settings-page__field">
          <label>Default writing style</label>
          <select value={writingStyle} onChange={(e) => setWritingStyle(e.target.value)}>
            <option value="Academic">Academic</option>
            <option value="Business">Business</option>
            <option value="Creative">Creative</option>
            <option value="Technical">Technical</option>
          </select>
        </div>
        <div className="settings-page__field">
          <label>AI model</label>
          <input value="DeepSeek V4 Flash (via Vercel AI Gateway)" disabled />
          <p className="tab-content__lead" style={{ marginTop: 8 }}>
            All plans use the same model. Subscription tier controls monthly request limits.
          </p>
        </div>
        {usage && (
          <div className="settings-page__field">
            <label>Monthly AI usage</label>
            <p>
              {usage.used} used
              {usage.limit != null ? ` / ${usage.limit} (${usage.remaining ?? 0} remaining)` : ' (unlimited)'}
            </p>
          </div>
        )}
        <button type="submit">Save settings</button>
      </form>

      <form className="settings-page__section" onSubmit={changePassword}>
        <h2>Password</h2>
        <div className="settings-page__field">
          <label>New password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <button type="submit">Update password</button>
      </form>
    </div>
  )
}
