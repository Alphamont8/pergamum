import type { Metadata } from 'next'
import { BackLink } from '@/components/ui/BackLink'
import { CONTACT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Cookie Policy',
  description: 'How Pergamum uses cookies and similar technologies.',
}

export default function CookiesPage() {
  return (
    <>
      <BackLink href="/login" />
      <header className="legal-header">
        <div className="pg-title-copy">
          <h1>Cookie Policy</h1>
          <p className="pg-muted">Effective July 13, 2026. Last updated July 13, 2026.</p>
        </div>
      </header>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Introduction</h2>
          <div className="legal-stack">
            <p>
              This Cookie Policy explains how Pergamum uses cookies and similar technologies when you
              visit or use our Service. It should be read together with our Privacy Policy. By using
              Pergamum, you understand that we use cookies as described here.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>What Are Cookies?</h2>
          <div className="legal-stack">
            <p>
              Cookies are small text files stored on your device. They help websites remember sessions,
              preferences, and security state. Similar technologies include local storage and session
              storage, which we may use for the same kinds of purposes.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Essential Auth Cookies (Supabase)</h2>
          <div className="legal-stack">
            <p>
              We use essential cookies and storage managed through Supabase Auth to keep you signed in,
              protect sessions, and enforce access controls. These cookies are required for login,
              account security, and authenticated API requests. Without them, core features of Pergamum
              cannot work.
            </p>
            <p>
              Auth cookies typically store session tokens or related identifiers. They are not used for
              advertising.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Preferences (Theme)</h2>
          <div className="legal-stack">
            <p>
              We store preference data such as your theme choice (for example light or dark mode) so the
              interface looks the way you left it. Preference storage may use cookies or local storage.
              These settings are optional for product function in a strict sense, but they improve
              usability and are limited to appearance and similar choices you control.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Analytics</h2>
          <div className="legal-stack">
            <p>
              We do not currently run third-party advertising or product analytics cookies on Pergamum.
              We may add privacy-respecting analytics in the future to understand aggregate usage and
              improve the product. If we do, we will update this Cookie Policy and, where required by law,
              provide notice or obtain consent before non-essential analytics cookies are set.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Stripe Checkout</h2>
          <div className="legal-stack">
            <p>
              When you purchase Cites or subscribe to Pro, checkout is handled by Stripe. Stripe and
              related payment pages may set their own cookies to process payments securely, prevent fraud,
              and complete the transaction. Those cookies are governed by Stripe&apos;s policies. Pergamum
              receives billing status and related identifiers needed to credit your account, not your full
              card number.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>How to Control Cookies</h2>
          <div className="legal-stack">
            <p>You can control cookies in several ways:</p>
            <ul>
              <li>
                Use your browser settings to block, delete, or limit cookies. Blocking essential auth
                cookies will prevent sign-in and most of the Service from working.
              </li>
              <li>
                Clear site data for pergamum.app (or your local development origin) to remove sessions and
                stored preferences.
              </li>
              <li>
                Sign out to end your authenticated session. Signing out clears or invalidates session
                cookies used for access.
              </li>
              <li>
                Manage payment-related cookies through Stripe&apos;s checkout experience and your browser
                controls when you visit Stripe-hosted pages.
              </li>
            </ul>
            <p>
              Browser controls vary by vendor. Check your browser&apos;s help documentation for steps to
              manage cookies and site storage.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Changes</h2>
          <div className="legal-stack">
            <p>
              We may update this Cookie Policy when our practices change. The effective or last updated
              date at the top will reflect revisions. Continued use of the Service after an update means
              you accept the revised policy.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Contact</h2>
          <div className="legal-stack">
            <p>
              Questions about cookies can be sent to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
