import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicSiteContent } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function AboutPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
  }, [])

  const about = (content.about as { text?: string } | undefined)?.text ?? ''
  const contact = (content.contact as { phone?: string; address?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">About Aabha Girls Hostel</h1>
        <p className="text-on-surface-variant max-w-2xl">{about}</p>
        <div className="space-y-1">
          <p className="text-on-surface">{contact.address}</p>
          <p className="text-on-surface">{contact.phone}</p>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
