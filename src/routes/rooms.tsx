import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicRoomAvailability, fetchPublicMedia, fetchPublicSiteContent, type PublicRoomAvailability, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const ROOM_FEATURES: Record<string, string[]> = {
  single: ['1 Person Capacity', 'High Speed Fiber WiFi', 'Private Study Desk', 'Spacious Cupboard'],
  twin: ['2 Persons Sharing', 'Dedicated Hub Access', 'Dual Workstations', 'Partitioned Wardrobe'],
  triple: ['3 Persons Sharing', 'Shared High Speed WiFi', 'Modular Study Ledge', 'Individual Lockers'],
}

const ROOM_BADGES: Record<string, string> = {
  single: 'Available',
  twin: 'Popular',
  triple: 'Value',
}

function RoomsPage() {
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])
  const [media, setMedia] = useState<PublicMediaItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicRoomAvailability().then(setAvailability)
    fetchPublicMedia().then(setMedia)
    fetchPublicSiteContent().then(setContent)
  }, [])

  const heroContent = (content.rooms_hero as { headline?: string; subhead?: string } | undefined) ?? {}
  const heroImage = media.find((m) => m.category === 'rooms_hero')?.url

  return (
    <PublicShell>
      <div className="space-y-16">
        <div className="relative rounded-xxl overflow-hidden h-80">
          {heroImage && <img src={heroImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
          <div className="absolute inset-0 bg-inverse-surface/50 flex flex-col justify-center items-center text-center px-8 space-y-2">
            <h1 className="font-display text-4xl text-inverse-on-surface">{heroContent.headline ?? 'Comfortable Spaces for Focused Learning'}</h1>
            <p className="text-inverse-on-surface/90 max-w-xl">{heroContent.subhead}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availability.map((room) => (
            <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
              <div className="relative">
                <img src={media.find((m) => m.category === `room_${room.room_type}`)?.url} alt={room.room_type} className="w-full h-44 object-cover" loading="lazy" />
                <span className="absolute top-3 left-3 bg-primary-container text-on-primary-container text-xs font-medium px-3 py-1 rounded-full uppercase">
                  {ROOM_BADGES[room.room_type]}
                </span>
              </div>
              <div className="p-6 space-y-3">
                <h3 className="font-display text-xl text-on-surface capitalize">{room.room_type} {room.room_type === 'single' ? 'Premium' : room.room_type === 'twin' ? 'Sharing' : 'Social'}</h3>
                <ul className="space-y-1 text-sm text-on-surface-variant">
                  {ROOM_FEATURES[room.room_type]?.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <div className="flex justify-between items-center pt-3 border-t border-outline-variant">
                  <div>
                    <p className="text-xs text-on-surface-variant">Starting from</p>
                    <p className="text-primary font-medium">NPR {room.monthly_price}/mo</p>
                  </div>
                  <Link to="/booking" className="bg-primary text-on-primary w-10 h-10 rounded-full flex items-center justify-center">→</Link>
                </div>
                <p className="text-on-surface text-sm font-medium">{room.beds_available} beds left</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface-container-low rounded-xxl p-12 text-center space-y-6">
          <h2 className="font-display text-3xl text-on-surface">Ready to Experience Aabha Girls Hostel?</h2>
          <div className="flex justify-center gap-4">
            <Link to="/booking" className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">Schedule a Private Tour</Link>
            <Link to="/transparency" className="border border-outline text-on-surface px-8 py-4 rounded-full font-medium active:scale-95 transition-transform">See Full Fee Schedule</Link>
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/rooms')({
  component: RoomsPage,
})
