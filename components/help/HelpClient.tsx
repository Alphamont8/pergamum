'use client'

import { FormEvent, useEffect, useState } from 'react'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import './help.css'

const FAQS = [
  {
    q: 'What are Cites?',
    a: 'Cites are the credits that power citation generation. Each one covers a single sentence that needs a source, and you can stock up on them through referrals, a one-time pack, or Pro.',
  },
  {
    q: 'How does citation generation work?',
    a: 'Paste in your draft, pick a referencing style, and hit generate. Pergamum scans for claims that need backing up, searches academic and web sources for a match, double-checks that the source actually supports the sentence, and then formats everything into in-text citations and a bibliography.',
  },
  {
    q: 'What is the free Pro features trial?',
    a: 'Your first Cites pack purchase (100, 200, or 500) unlocks 7 days of Pro features. Deeper verification, faster generation, every referencing style, exports, and specialty databases. The trial does not include the 200 monthly Cites allotment, and it never auto-converts or charges you when it ends. Pack Cites you buy still never expire.',
  },
  {
    q: 'Do pack Cites expire?',
    a: 'No. Cites from packs, referrals, and signup grants never expire. If you subscribe to Pro, the monthly allotment is separate and resets each billing month, and unused monthly Cites do not roll over.',
  },
  {
    q: 'What is the difference between pack Cites and Pro Cites?',
    a: 'Pack and referral Cites never expire. Pro adds a fresh monthly allotment that is used first when you generate, then your pack Cites. When Pro ends, unused monthly allotment clears, but your pack Cites stay.',
  },
  {
    q: 'Can I use Pergamum without an account?',
    a: 'You will need to sign in first. It only takes a minute, and it means your Cites, saved drafts, leaderboard spot, and settings all stick around for next time.',
  },
  {
    q: 'Which referencing styles are supported?',
    a: 'Basic includes APA 7, MLA 9, and Harvard. Pro unlocks the full catalog, including Chicago, IEEE, Vancouver, AMA, ACS, ASA, Nature, Science, MHRA, OSCOLA, and Bluebook.',
  },
  {
    q: 'Why was a sentence skipped?',
    a: 'Usually it is because the sentence reads as opinion, describes a method rather than a claim, or already has a citation. Sometimes Pergamum just cannot find a source that confidently backs it up. Feel free to tweak the sentence and try generating again.',
  },
  {
    q: 'What happens if a citation search fails?',
    a: 'You are only charged for sentences Pergamum attempts. If a sentence cannot be cited, those Cites are refunded automatically.',
  },
  {
    q: 'How do referrals work?',
    a: 'Share your referral code or link with a friend. When they use it as their first friend code — at signup or later in Cites or Leaderboard — and then run a citation that uses Cites, you both get 25 Cites. Extra friend codes after the first still connect you as friends, but only that first code can earn the bonus.',
  },
]

const HOW_IT_WORKS = [
  'Paste your draft into the composer, then choose the referencing style and source preferences that fit your assignment.',
  'Hit Generate and Pergamum flags the sentences that need supporting evidence, showing you exactly how many Cites the job will take before anything is spent.',
  'From there, Pergamum searches academic and web sources, checks that each match genuinely backs up the sentence, and formats your in-text citations and bibliography in the style you picked.',
  'Review your finished draft and bibliography, copy whichever part you need, and swing back to your library any time you want to pick it up again.',
]

export function HelpClient() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!sent) return
    const timer = setTimeout(() => setSent(false), 2000)
    return () => clearTimeout(timer)
  }, [sent])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setStatus(null)
    setSent(false)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, email: email.trim() || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'We couldn\u2019t send your feedback.')
      setMessage('')
      setSent(true)
      setStatus(null)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'We couldn\u2019t send your feedback.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="help-page">
      <BackLink />
      <header className="help-header">
        <h1>Help</h1>
      </header>

      <section className="help-panel">
        <h2>How It Works</h2>
        <ol className="help-steps">
          {HOW_IT_WORKS.map((step) => (
            <li key={step.slice(0, 32)}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="help-panel">
        <h2>FAQs</h2>
        <div className="help-faqs">
          {FAQS.map((item) => (
            <details key={item.q} className="help-faq">
              <summary>
                <span>{item.q}</span>
                <span className="help-faq__chevron" aria-hidden />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="help-panel help-feedback">
        <div className="pg-title-copy">
          <h2>Feedback</h2>
          <p className="pg-muted help-feedback__intro">
            Run into something confusing, or got an idea for a feature we should build? Tell us
            about it. We read every message and use it to make Pergamum better for everyone.
          </p>
        </div>
        <form className="help-form" onSubmit={onSubmit}>
          <label>
            <span>Message</span>
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What should we improve?"
            />
          </label>
          <label>
            <span>Email (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
            />
          </label>
          {status ? <p className="help-status">{status}</p> : null}
          <Button
            type="submit"
            variant="accent"
            className="pg-btn--action"
            disabled={busy || message.trim().length < 10}
          >
            {busy ? 'Sending…' : sent ? 'Sent' : 'Send Feedback'}
          </Button>
        </form>
      </section>

      <nav className="help-legal" aria-label="Legal">
        <a href="/privacy">Privacy</a>
        <span aria-hidden>·</span>
        <a href="/terms">Terms</a>
        <span aria-hidden>·</span>
        <a href="/cookies">Cookies</a>
      </nav>
    </div>
  )
}
