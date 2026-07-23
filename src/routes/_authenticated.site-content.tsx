import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchSiteContent } from '../lib/siteContent'
import { fetchMedia, type MediaItem } from '../lib/media'
import { fetchReviews, type Review } from '../lib/reviews'
import { fetchMenuItems, type MenuItem } from '../lib/menu'
import { fetchInquiries, type Inquiry } from '../lib/inquiries'
import { fetchPendingBookings, type Booking } from '../lib/bookings'
import { fetchRoomsWithBeds, type Room, type Bed } from '../lib/rooms'
import { SiteContentForm } from '../components/admin/SiteContentForm'
import { MediaGalleryManager } from '../components/admin/MediaGalleryManager'
import { ReviewsManager } from '../components/admin/ReviewsManager'
import { MenuEditor } from '../components/admin/MenuEditor'
import { InquiriesInbox } from '../components/admin/InquiriesInbox'
import { BookingsQueue } from '../components/admin/BookingsQueue'

const MEDIA_CATEGORIES = ['hero', 'rooms_hero', 'team_warden', 'team_owner', 'highlight', 'room_single', 'room_twin', 'room_triple', 'facility'] as const

function SiteContentPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [media, setMedia] = useState<MediaItem[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  function refetchAll() {
    fetchSiteContent().then(setContent)
    fetchMedia().then(setMedia)
    fetchReviews().then(setReviews)
    fetchMenuItems().then(setMenuItems)
    fetchInquiries().then(setInquiries)
    fetchPendingBookings().then(setBookings)
    fetchRoomsWithBeds().then(setRooms)
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function vacantBedsByType(roomType: Booking['room_type']): Bed[] {
    // bookings.room_type is deliberately still the bare room_type enum
    // (lowercase: single/twin/triple) - out of scope for the room_types
    // split. rooms.room_type_name now comes from room_types.name, which
    // the split migration capitalizes (initcap) for the pre-existing
    // types, so this comparison must be case-insensitive rather than exact.
    return rooms
      .filter((r) => r.room_type_name.toLowerCase() === roomType)
      .flatMap((r) => r.beds)
      .filter((b) => b.status === 'vacant')
  }

  return (
    <div className="space-y-12">
      <h2 className="font-display text-2xl text-on-surface">Site Content</h2>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Copy</h3>
        <SiteContentForm content={content} onSaved={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Photos</h3>
        {MEDIA_CATEGORIES.map((category) => (
          <div key={category} className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-secondary">{category.replace('_', ' ')}</p>
            <MediaGalleryManager
              category={category}
              items={media.filter((m) => m.category === category)}
              onChanged={refetchAll}
            />
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Reviews</h3>
        <ReviewsManager reviews={reviews} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Weekly Menu</h3>
        <MenuEditor items={menuItems} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Inquiries</h3>
        <InquiriesInbox inquiries={inquiries} onChanged={refetchAll} />
      </section>

      <section className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Bookings</h3>
        <BookingsQueue bookings={bookings} vacantBedsByType={vacantBedsByType} onDecided={refetchAll} />
      </section>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/site-content')({
  component: SiteContentPage,
})
