import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, fetchRoomsWithStatus, type Room, type RoomWithStatus } from '../../lib/rooms'
import { fetchDuesInvoices, type Invoice } from '../../lib/fees'
import { fetchPendingBookings, type Booking } from '../../lib/bookings'
import { fetchOpenTickets, type TicketWithStudent } from '../../lib/maintenance'
import { calculateOccupancyRate } from '../../lib/occupancy'
import { DefaulterList } from './DefaulterList'
import { PendingBookingsList } from './PendingBookingsList'
import { RoomGrid } from '../rooms/RoomGrid'
import { TicketList } from '../maintenance/TicketList'

export function OwnerDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [showDefaulters, setShowDefaulters] = useState(false)

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchDuesInvoices().then(setInvoices)
    fetchPendingBookings().then(setBookings)
    fetchOpenTickets().then(setTickets)
  }, [])

  const vacantBedCount = rooms.flatMap((room) => room.beds).filter((bed) => bed.status === 'vacant').length
  const outstandingTotal = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter max-w-4xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        <a href="/room-board" className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 block">
          <p className="text-xs uppercase tracking-wider text-secondary">Vacant Beds</p>
          <p className="font-display text-4xl text-primary mt-2">{vacantBedCount}</p>
        </a>
        <button
          type="button"
          onClick={() => setShowDefaulters((current) => !current)}
          className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 text-left"
        >
          <p className="text-xs uppercase tracking-wider text-secondary">Outstanding Dues</p>
          <p className="font-display text-4xl text-primary mt-2">{outstandingTotal}</p>
          <p className="text-xs text-on-surface-variant mt-1">{invoices.length} invoice(s)</p>
        </button>
      </div>

      {showDefaulters && <DefaulterList invoices={invoices} />}

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Rooms</h3>
        <RoomGrid rooms={roomsWithStatus} role="owner" selectedRoomId={null} onSelectRoom={() => {}} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Pending Bookings</h3>
        <PendingBookingsList bookings={bookings} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Open Complaints</h3>
        <TicketList tickets={tickets} />
      </div>
    </div>
  )
}
