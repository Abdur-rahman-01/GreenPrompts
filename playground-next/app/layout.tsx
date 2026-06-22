import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GreenPrompt Playground — Sustainable AI',
  description: 'Route your prompts to the most energy-efficient AI model. Real-time CO₂, energy and cost comparison.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="bg-fixed"></div>
        <div className="bg-overlay"></div>
        {children}
      </body>
    </html>
  )
}
