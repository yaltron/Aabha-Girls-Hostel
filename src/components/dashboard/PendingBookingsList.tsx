import type { Booking } from '../../lib/bookings'

export function PendingBookingsList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <p className="text-on-surface-variant text-sm">No pending bookings.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Phone</th>
            <th className="px-8 py-4">Room Type</th>
            <th className="px-8 py-4">Preferred Date</th>
            <th className="px-8 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{booking.name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.phone}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.room_type}</td>
              <td className="px-8 py-5 text-on-surface-variant">{booking.preferred_date}</td>
              <td className="px-8 py-5">
                <a href="/site-content" className="text-primary font-medium hover:underline">
                  Review
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
