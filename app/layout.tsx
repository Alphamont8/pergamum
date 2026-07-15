import type { Metadata } from 'next'
import { Hanken_Grotesk } from 'next/font/google'
import { ThemeInitScript } from '@/components/theme/ThemeInitScript'
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
      </body>
    </html>
  )
}
