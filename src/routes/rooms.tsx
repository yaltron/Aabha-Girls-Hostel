import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicRoomAvailability, fetchPublicMedia, type PublicRoomAvailability, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function RoomsPage() {
  const [availability, setAvailability] = useState<PublicRoomAvailability[]>([])
  const [media, setMedia] = useState<PublicMediaItem[]>([])

  useEffect(() => {
    fetchPublicRoomAvailability().then(setAvailability)
    fetchPublicMedia().then(setMedia)
  }, [])

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">Rooms</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {availability.map((room) => (
            <div key={room.room_type} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
              <img
                src={media.find((m) => m.category === `room_${room.room_type}`)?.url}
                alt={room.room_type}
                className="rounded-xxl w-full h-40 object-cover"
                loading="lazy"
              />
              <h3 className="font-display text-xl text-on-surface capitalize">{room.room_type} Sharing</h3>
              <p className="text-on-surface-variant">Starting from Rs. {room.monthly_price}/month</p>
              <p className="text-primary font-medium">{room.beds_available} beds left</p>
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/rooms')({
  component: RoomsPage,
})
