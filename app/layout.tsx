import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Keyword Strategy Agent',
  description: 'Internal SEO keyword strategy tool',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
