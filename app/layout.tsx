import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'
import '../components/layout/MainWorkspace.css'
import '../components/layout/AppSidebar.css'

export const metadata: Metadata = {
  title: 'Pergamum',
  description: 'AI-assisted essay writing workspace',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
