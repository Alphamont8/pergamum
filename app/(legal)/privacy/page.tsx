import type { Metadata } from 'next'
import { BackLink } from '@/components/ui/BackLink'
import { CONTACT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Pergamum collects, uses, and protects your information.',
}

export default function PrivacyPage() {
  return (
    <>
      <BackLink href="/login" />
      <header className="legal-header">
        <div className="pg-title-copy">
          <h1>Privacy Policy</h1>
          <p className="pg-muted">Effective July 13, 2026. Last updated July 13, 2026.</p>
        </div>
      </header>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Introduction</h2>
          <div className="legal-stack">
            <p>
              Pergamum (&quot;Pergamum,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides a citation
              and bibliography service that helps you find sources, verify claims, and format references.
              This Privacy Policy explains what information we collect, how we use it, and the choices you
              have. By using Pergamum, you agree to this policy.
            </p>
            <p>
              If you do not agree, please do not use the service. Questions about this policy can be sent
              to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Information We Collect</h2>
          <div className="legal-stack">
            <p>We collect information in these categories:</p>
            <ul>
              <li>
                <strong>Account information.</strong> Email address, password (stored hashed by our auth
                provider), display name, username, profile preferences, and optional avatar details you
                provide during signup or in Settings.
              </li>
              <li>
                <strong>Authentication data.</strong> Session tokens and related auth cookies managed
                through Supabase Auth, including when you sign in with Google or email and password.
              </li>
              <li>
                <strong>Content you submit.</strong> Draft text, generation requests, citation styles and
                preferences, feedback messages, and other materials you upload or paste into the product.
              </li>
              <li>
                <strong>Usage and product data.</strong> Cites totals and spend history, generation
                records, referral codes and redemptions, leaderboard-related activity, plan tier, and
                feature settings such as default referencing style.
              </li>
              <li>
                <strong>Billing information.</strong> Payment status, subscription state, and
                billing-related identifiers from our payment provider (Lemon Squeezy). Card numbers and
                full payment credentials are handled by Lemon Squeezy and are not stored on Pergamum
                servers.
              </li>
              <li>
                <strong>Technical data.</strong> IP address, browser type, device information, approximate
                location derived from IP, timestamps, and diagnostic logs needed to operate and secure
                the service.
              </li>
              <li>
                <strong>Cookies and similar technologies.</strong> Essential session cookies, preference
                cookies (such as theme), and any cookies set by payment flows. See our Cookie Policy for
                details.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>How We Use Information</h2>
          <div className="legal-stack">
            <p>We use personal information to:</p>
            <ul>
              <li>Create and manage your account, sessions, and profile.</li>
              <li>Provide citation generation, source search, verification, formatting, and related features.</li>
              <li>Track Cites, referrals, leaderboards, and plan entitlements.</li>
              <li>Process purchases, subscriptions, invoices, and customer billing support via Lemon Squeezy.</li>
              <li>Respond to feedback, support requests, and security or abuse investigations.</li>
              <li>Improve reliability, quality, and product design, including debugging and performance monitoring.</li>
              <li>Comply with law, enforce our Terms of Service, and protect users and Pergamum.</li>
              <li>Communicate about service updates, security notices, and account-related messages.</li>
            </ul>
            <p>
              We do not sell your personal information. We do not use your draft content to train public
              marketing models for unrelated third parties.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>AI and Source Search</h2>
          <div className="legal-stack">
            <p>
              To generate citations, Pergamum may send portions of your draft, style preferences, and
              related instructions to artificial intelligence and search providers. Those providers process
              the content solely to return model outputs, source candidates, and verification signals for
              your request.
            </p>
            <p>
              AI systems can produce incomplete, incorrect, or outdated results. You remain responsible for
              reviewing citations and bibliographies before submitting academic or professional work. We
              may log request metadata and outcomes to operate the pipeline, prevent abuse, and improve
              service quality.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Payments (Lemon Squeezy)</h2>
          <div className="legal-stack">
            <p>
              Paid Cites packs and subscriptions are processed by Lemon Squeezy as Merchant of Record.
              When you check out, Lemon Squeezy collects payment details under Lemon Squeezy&apos;s
              privacy policy. We receive limited billing information such as customer and subscription
              identifiers, payment status, and plan details needed to unlock Pro features or credit your
              Cites.
            </p>
            <p>
              Refunds, chargebacks, and tax handling follow Lemon Squeezy&apos;s tools and applicable law.
              Contact us if a payment issue needs our help coordinating with Lemon Squeezy.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Referrals and Leaderboards</h2>
          <div className="legal-stack">
            <p>
              If you share a referral code or link, we associate successful signups with your account to
              award Cites and connect friends where the product supports it. Leaderboards may display
              usernames, referral or activity scores, and similar public profile fields you choose to show.
            </p>
            <p>
              Do not share someone else&apos;s personal data through referral or leaderboard features. We
              may remove or adjust rankings that appear abusive or fraudulent.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Data Sharing</h2>
          <div className="legal-stack">
            <p>We share information only as needed to run Pergamum:</p>
            <ul>
              <li>
                <strong>Service providers.</strong> Supabase (authentication, database, storage), Lemon
                Squeezy (payments), hosting and infrastructure providers, and AI or search vendors that
                process content to fulfill your requests.
              </li>
              <li>
                <strong>Legal and safety.</strong> When required by law, court order, or to protect rights,
                safety, and integrity of users or Pergamum.
              </li>
              <li>
                <strong>Business transfers.</strong> In connection with a merger, acquisition, financing, or
                sale of assets, subject to continued confidentiality protections where reasonably possible.
              </li>
              <li>
                <strong>With your direction.</strong> When you ask us to share information or use a feature
                that is inherently public, such as leaderboard display names.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Data Retention</h2>
          <div className="legal-stack">
            <p>
              We retain account, generation, billing, and usage records for as long as your account is
              active and as needed to provide the service, resolve disputes, enforce agreements, and meet
              legal or accounting obligations. If you delete your account through Settings, we will delete
              or anonymize personal data associated with your profile within a reasonable period, except
              where we must retain limited records (for example fraud prevention, completed transactions,
              or legal holds).
            </p>
            <p>
              Backup systems may retain residual copies for a short additional period before they are
              overwritten in the ordinary course of operations.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Security</h2>
          <div className="legal-stack">
            <p>
              We use administrative, technical, and organizational measures designed to protect personal
              information, including encrypted connections, access controls, and reliance on reputable
              infrastructure providers. No method of transmission or storage is completely secure. You are
              responsible for keeping your password and account credentials confidential.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Your Rights</h2>
          <div className="legal-stack">
            <p>
              Depending on where you live, you may have rights to access, correct, update, export, or
              delete personal information, or to object to or restrict certain processing. You can update
              many profile fields in Settings, and you can request account deletion from Settings or by
              emailing{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
            <p>
              We may need to verify your identity before fulfilling a request. If a local privacy law
              provides additional rights (such as under the GDPR or CCPA/CPRA), we will honor those rights
              as required. You may also have the right to lodge a complaint with a supervisory authority.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Children</h2>
          <div className="legal-stack">
            <p>
              Pergamum is not directed to children under 13, and we do not knowingly collect personal
              information from children under 13. If you believe a child has provided us personal
              information, contact us and we will take appropriate steps to delete it. If you are between
              13 and the age of digital consent in your region, use Pergamum only with permission from a
              parent or guardian where required.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>International Transfers</h2>
          <div className="legal-stack">
            <p>
              Pergamum may process and store information in the United States and other countries where we
              or our providers operate. Those locations may have different data protection laws than your
              home country. Where required, we use appropriate safeguards for cross-border transfers, such
              as contractual protections with service providers.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Changes</h2>
          <div className="legal-stack">
            <p>
              We may update this Privacy Policy from time to time. When we do, we will revise the effective
              or last updated date above and, when changes are material, provide additional notice through
              the product or by email where appropriate. Continued use of Pergamum after an update means
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
              For privacy questions, requests, or concerns, contact Pergamum at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
