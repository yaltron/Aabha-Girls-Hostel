import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicSiteContent, fetchPublicMedia, fetchPublicReviews, type PublicMediaItem, type PublicReview } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function HomePage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [highlights, setHighlights] = useState<PublicMediaItem[]>([])
  const [reviews, setReviews] = useState<PublicReview[]>([])

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia('highlight').then(setHighlights)
    fetchPublicReviews().then(setReviews)
  }, [])

  const hero = (content.hero as { headline?: string; subhead?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-12">
        <div className="space-y-4">
          <h1 className="font-display text-4xl text-primary">{hero.headline ?? 'Aabha Girls Hostel'}</h1>
          <p className="text-on-surface-variant">{hero.subhead}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {highlights.map((item) => (
            <img key={item.id} src={item.url} alt={item.caption ?? ''} className="rounded-xxl w-full h-32 object-cover" loading="lazy" />
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-2xl text-on-surface">What Families Say</h2>
          {reviews.map((review) => (
            <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6">
              <p className="text-on-surface">{review.quote}</p>
              <p className="text-on-surface-variant text-sm mt-1">- {review.author_name}</p>
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
