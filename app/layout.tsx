import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JMI Planner',
  description: 'Just Move In — Meeting actions & day planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
