import { useState } from 'react'
import { approveBooking, declineBooking, type Booking } from '../../lib/bookings'
import type { Bed } from '../../lib/rooms'

function BookingRow({
  booking,
  vacantBeds,
  onDecided,
}: {
  booking: Booking
  vacantBeds: Bed[]
  onDecided: () => void
}) {
  const [selectedBedId, setSelectedBedId] = useState(vacantBeds[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    try {
      await approveBooking(booking.id, selectedBedId)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function handleDecline() {
    setError(null)
    try {
      await declineBooking(booking.id)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decline failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
      <div>
        <p className="font-medium text-on-surface">{booking.name}</p>
        <p className="text-on-surface-variant text-sm">{booking.phone} - Guardian: {booking.guardian_phone}</p>
        <p className="text-xs uppercase tracking-wider text-secondary mt-1">
          {booking.room_type} - Preferred {booking.preferred_date}
        </p>
      </div>
      {vacantBeds.length > 0 && (
        <div className="space-y-2">
          <label htmlFor={`bed-${booking.id}`} className="block text-sm font-medium text-on-surface-variant">Assign Bed</label>
          <select
            id={`bed-${booking.id}`}
            value={selectedBedId}
            onChange={(e) => setSelectedBedId(e.target.value)}
            className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
          >
            {vacantBeds.map((bed) => (
              <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
            ))}
          </select>
        </div>
      )}
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={vacantBeds.length === 0}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform disabled:opacity-50"
        >
          Approve
        </button>
        <button onClick={handleDecline} className="border border-error text-error px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Decline
        </button>
      </div>
    </div>
  )
}

export function BookingsQueue({
  bookings,
  vacantBedsByType,
  onDecided,
}: {
  bookings: Booking[]
  vacantBedsByType: (roomType: Booking['room_type']) => Bed[]
  onDecided: () => void
}) {
  return (
    <div className="space-y-4">
      {bookings.map((booking) => (
        <BookingRow
          key={booking.id}
          booking={booking}
          vacantBeds={vacantBedsByType(booking.room_type)}
          onDecided={onDecided}
        />
      ))}
    </div>
  )
}
