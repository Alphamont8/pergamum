import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { GUEST_COOKIE, GUEST_DEFAULT_PROJECT_ID } from '@/lib/guest/constants'

export default async function GuestHomePage() {
  const cookieStore = await cookies()
  if (cookieStore.get(GUEST_COOKIE)?.value !== '1') {
    redirect('/login')
  }

  return (
    <div className="projects-page">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Workspace</h1>
          <p className="tab-content__lead">
            <strong>Basic</strong> plan — not signed in. Work is stored in this browser only.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create account</Link>
        </div>
      </header>

      <div className="projects-page__grid">
        <Link
          href={`/guest/project/${GUEST_DEFAULT_PROJECT_ID}/blueprint`}
          className="project-card"
        >
          <h3>Sample Essay</h3>
          <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: 0 }}>Continue where you left off</p>
        </Link>
      </div>
    </div>
  )
}
