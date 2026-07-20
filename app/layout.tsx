import type { Metadata } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { ThemeInitScript } from '@/components/theme/ThemeInitScript'
import { PRODUCTION_APP_URL } from '@/lib/site'
import { Providers } from './providers'
import './globals.css'

const hanken = Hanken_Grotesk({
  subsets: ['latin'],
  variable: '--font-hanken',
  display: 'swap',
  weight: ['300', '400', '500', '600'],
})

const siteDescription =
  'Paste your draft, and let Pergamum find the sources, verify the claims, and build your bibliography for you.'

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_APP_URL),
  title: {
    default: 'Pergamum',
    template: '%s · Pergamum',
  },
  description: siteDescription,
  openGraph: {
    title: 'Pergamum',
    description: siteDescription,
    siteName: 'Pergamum',
    type: 'website',
    url: PRODUCTION_APP_URL,
  },
  twitter: {
    card: 'summary',
    title: 'Pergamum',
    description: siteDescription,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={hanken.variable}>
      <head>
        <ThemeInitScript />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
