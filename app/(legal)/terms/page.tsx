import type { Metadata } from 'next'
import { BackLink } from '@/components/ui/BackLink'
import { CONTACT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms that govern your use of Pergamum.',
}

export default function TermsPage() {
  return (
    <>
      <BackLink href="/login" />
      <header className="legal-header">
        <div className="pg-title-copy">
          <h1>Terms of Service</h1>
          <p className="pg-muted">Effective July 13, 2026. Last updated July 13, 2026.</p>
        </div>
      </header>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Agreement</h2>
          <div className="legal-stack">
            <p>
              These Terms of Service (&quot;Terms&quot;) are a legal agreement between you and Pergamum
              governing access to and use of the Pergamum website, applications, and related services
              (collectively, the &quot;Service&quot;). By creating an account, signing in, or using the
              Service, you agree to these Terms and our Privacy Policy.
            </p>
            <p>
              If you are using the Service on behalf of an organization, you represent that you have
              authority to bind that organization, and &quot;you&quot; includes that organization. If you
              do not agree, do not use the Service.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Accounts</h2>
          <div className="legal-stack">
            <p>
              You must provide accurate account information and keep your credentials secure. You are
              responsible for all activity under your account. Notify us promptly if you suspect
              unauthorized access.
            </p>
            <p>
              You must be at least 13 years old, or the minimum age required in your jurisdiction to use
              online services without parental consent. We may refuse, suspend, or terminate accounts that
              violate these Terms or appear fraudulent.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Cites and Billing</h2>
          <div className="legal-stack">
            <p>
              Pergamum uses Cites as usage credits for citation generation and related features. Cites may
              be granted through signup, referrals, promotions, one-time packs, or a Pro subscription,
              subject to the Cites counts and rules shown in the product.
            </p>
            <ul>
              <li>
                Cites have no cash value and are non-transferable except as we expressly allow. Pack,
                referral, and promotional Cites do not expire under the current product rules. The
                monthly Pro allotment refreshes each billing month and unused allotment does not roll
                over. We may adjust product economics with reasonable notice where required.
              </li>
              <li>
                A one-time Pro features trial may be included with a first Cites pack purchase for
                eligible accounts. That trial unlocks Pro features only (not the monthly Cites
                allotment) and does not automatically convert to a paid subscription or charge your
                payment method when it ends.
              </li>
              <li>
                Paid purchases and subscriptions are processed by Stripe. Prices, taxes, and billing
                intervals are presented at checkout. Unless required by law or stated otherwise at
                purchase, paid Cites and subscription fees are non-refundable once delivered or activated.
              </li>
              <li>
                Subscriptions renew automatically until canceled through the billing portal or Settings
                flows we provide. Cancellation stops future renewals. It does not undo charges already
                processed for the current period unless required by law.
              </li>
              <li>
                We may correct billing errors, reclaim credits obtained through abuse, and adjust
                entitlements when payments fail or are reversed.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Acceptable Use</h2>
          <div className="legal-stack">
            <p>You agree not to:</p>
            <ul>
              <li>Violate any law, academic policy, or third-party right.</li>
              <li>Attempt to reverse engineer, scrape, overload, disrupt, or bypass security or rate limits.</li>
              <li>Share accounts, resell access, or farm referrals or Cites through fake or automated activity.</li>
              <li>Upload malware, unlawful content, or material you do not have rights to use.</li>
              <li>Impersonate others or misrepresent your affiliation with Pergamum.</li>
              <li>Use the Service to generate bulk spam, harassment, or deceptive academic or professional materials.</li>
            </ul>
            <p>
              We may investigate suspected misuse and suspend or terminate access, remove content, or
              withhold promotional Cites when we reasonably believe these Terms have been violated.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Academic Integrity</h2>
          <div className="legal-stack">
            <p>
              Pergamum is a productivity tool for finding, verifying, and formatting sources. You alone
              are responsible for how you use outputs in coursework, research, publishing, or professional
              submissions. You must follow your school&apos;s, employer&apos;s, or publisher&apos;s rules
              on citation, collaboration, and AI assistance.
            </p>
            <p>
              Submitting work that does not properly attribute sources, or that violates academic honesty
              policies, is your responsibility. Pergamum does not guarantee that generated citations satisfy
              any particular assignment, rubric, or institutional requirement.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>AI Output Disclaimer</h2>
          <div className="legal-stack">
            <p>
              The Service uses artificial intelligence, automated search, and heuristics. Outputs may be
              inaccurate, incomplete, outdated, biased, or mismatched to your draft. Source matches may
              fail verification or later become unavailable. You should review every citation, quotation,
              paraphrase, and bibliography entry before relying on it.
            </p>
            <p>
              Pergamum does not warrant that AI outputs are error-free, plagiarism-safe, or suitable for
              any specific academic or legal purpose. Use of AI features is at your own risk.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Intellectual Property</h2>
          <div className="legal-stack">
            <p>
              Pergamum and its branding, software, design, and documentation are owned by Pergamum or its
              licensors and are protected by intellectual property laws. These Terms do not grant you any
              right to copy, modify, or redistribute our software or marks except as needed to use the
              Service as offered.
            </p>
            <p>
              You retain ownership of content you submit. You grant Pergamum a worldwide, non-exclusive
              license to host, process, transmit, and display that content solely to operate, secure, and
              improve the Service for you. You represent that you have the rights needed to submit that
              content.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Termination</h2>
          <div className="legal-stack">
            <p>
              You may stop using the Service at any time and may delete your account through Settings
              where available. We may suspend or terminate access immediately if you breach these Terms,
              if required by law, or if continuing to provide the Service creates risk or undue burden.
            </p>
            <p>
              Upon termination, your right to use the Service ends. Provisions that by nature should
              survive (including ownership, disclaimers, limitations of liability, indemnity, and
              governing law) will survive.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Disclaimers</h2>
          <div className="legal-stack">
            <p>
              THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE MAXIMUM
              EXTENT PERMITTED BY LAW, PERGAMUM DISCLAIMS ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, OR
              STATUTORY, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND
              NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR FREE
              OF ERRORS, OR THAT CITATIONS OR SOURCES WILL BE COMPLETE OR CORRECT.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Limitation of Liability</h2>
          <div className="legal-stack">
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PERGAMUM AND ITS AFFILIATES, OFFICERS, EMPLOYEES,
              AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, DATA, GOODWILL, OR ACADEMIC OR
              PROFESSIONAL OPPORTUNITY, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE.
            </p>
            <p>
              OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE OR THESE TERMS
              WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID TO PERGAMUM FOR THE SERVICE IN THE
              TWELVE MONTHS BEFORE THE CLAIM OR (B) FIFTY U.S. DOLLARS (US $50). Some jurisdictions do not
              allow certain limitations, so parts of this section may not apply to you.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Indemnity</h2>
          <div className="legal-stack">
            <p>
              You agree to defend, indemnify, and hold harmless Pergamum and its affiliates, officers,
              employees, and agents from and against claims, damages, losses, liabilities, costs, and
              expenses (including reasonable attorneys&apos; fees) arising out of or related to your
              content, your use of the Service, your violation of these Terms, or your violation of any
              law or third-party right, including academic integrity policies.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Governing Law</h2>
          <div className="legal-stack">
            <p>
              These Terms are governed by the laws of the State of Delaware, United States, without regard
              to conflict-of-law principles, except where mandatory consumer protections in your place of
              residence require otherwise. Courts located in Delaware will have exclusive jurisdiction
              over disputes arising from these Terms, unless applicable law gives you the right to bring
              claims in another forum.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Changes</h2>
          <div className="legal-stack">
            <p>
              We may update these Terms from time to time. We will post the updated Terms with a revised
              effective date and, for material changes, provide additional notice in the product or by
              email where appropriate. If you continue using the Service after changes take effect, you
              accept the updated Terms. If you do not agree, stop using the Service and delete your
              account.
            </p>
          </div>
        </div>
      </section>

      <section className="legal-section">
        <div className="pg-title-copy">
          <h2>Contact</h2>
          <div className="legal-stack">
            <p>
              Questions about these Terms can be sent to{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  )
}
