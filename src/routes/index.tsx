import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  fetchPublicSiteContent,
  fetchPublicMedia,
  fetchPublicReviews,
  fetchPublicRoomAvailability,
  type PublicMediaItem,
  type PublicReview,
  type PublicRoomAvailability,
} from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

type Stat = { label: string; sublabel: string }
type TrustPoint = { title: string; description: string }

function HomePage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [highlights, setHighlights] = useState<PublicMediaItem[]>([])
  const [reviews, setReviews] = useState<PublicReview[]>([])
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia('highlight').then(setHighlights)
    fetchPublicReviews().then(setReviews)
    fetchPublicRoomAvailability().then(setAvailability)
  }, [])

  const hero = (content.hero as { headline?: string; subhead?: string } | undefined) ?? {}
  const stats = (content.trust_stats as Stat[] | undefined) ?? []
  const trustPoints = (content.trust_points as TrustPoint[] | undefined) ?? []
  const contact = (content.contact as { phone?: string } | undefined) ?? {}

  return (
    <PublicShell>
      <div className="space-y-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="inline-block bg-secondary-container text-secondary text-xs font-medium uppercase tracking-wide px-4 py-1.5 rounded-full">
              Boutique Residence for Women
            </span>
            <h1 className="font-display text-4xl md:text-5xl text-on-surface leading-tight">{hero.headline ?? 'A Safe Home Away From Home for Your Daughter'}</h1>
            <p className="text-on-surface-variant text-lg max-w-lg">{hero.subhead}</p>
            <div className="flex gap-4">
              <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Book a Visit</Link>
              <Link to="/rooms" className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">View Rooms</Link>
            </div>
          </div>
          {highlights[0] && (
            <img src={highlights[0].url} alt={highlights[0].caption ?? ''} className="rounded-xxl w-full h-96 object-cover shadow-premium-lg" loading="lazy" />
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-surface-container-low rounded-xxl p-8">
          {stats.map((stat, i) => (
            <div key={i} className="text-center space-y-1">
              <p className="font-display text-lg text-on-surface">{stat.label}</p>
              <p className="text-on-surface-variant text-xs">{stat.sublabel}</p>
            </div>
          ))}
        </div>

        <div className="space-y-8 text-center">
          <p className="text-secondary text-xs uppercase tracking-wide">Our Commitment</p>
          <h2 className="font-display text-3xl text-on-surface">Why Parents Choose Aabha</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {trustPoints.map((point, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 text-left space-y-2">
                <h3 className="font-display text-lg text-on-surface">{point.title}</h3>
                <p className="text-on-surface-variant text-sm">{point.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-secondary text-xs uppercase tracking-wide">The Sanctuary Rooms</p>
              <h2 className="font-display text-3xl text-on-surface">Designed for Focus and Comfort</h2>
            </div>
            <Link to="/rooms" className="text-primary font-medium hover:underline">View All Details →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {availability.map((room) => (
              <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
                <img
                  src={highlights.find((h) => h.category === `room_${room.room_type}`)?.url}
                  alt={room.room_type}
                  className="w-full h-48 object-cover"
                  loading="lazy"
                />
                <div className="p-6 space-y-1">
                  <h3 className="font-display text-lg text-on-surface capitalize">{room.room_type} Sharing</h3>
                  <p className="text-primary font-medium">NPR {room.monthly_price} / month</p>
                  <p className="text-on-surface-variant text-sm">{room.beds_available} beds left</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {reviews.length > 0 && (
          <div className="space-y-6">
            <h2 className="font-display text-2xl text-on-surface">What Families Say</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {reviews.map((review) => (
                <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6">
                  <p className="text-on-surface">{review.quote}</p>
                  <p className="text-on-surface-variant text-sm mt-2">- {review.author_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-surface-container-low rounded-xxl p-12 text-center space-y-6">
          <h2 className="font-display text-3xl text-on-surface">Ready to give her the best living experience?</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto">Take a personalized tour of our facilities and see why Aabha is the preferred choice for parents.</p>
          <div className="flex justify-center gap-4">
            <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Schedule an In-Person Visit</Link>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Call for Inquiry</a>
            )}
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
