import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../../lib/rooms'
import { fetchDuesInvoices, type Invoice } from '../../lib/fees'
import { calculateOccupancyRate } from '../../lib/occupancy'

export function StudentDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    fetchDuesInvoices().then(setInvoices)
  }, [])

  const nextDue = [...invoices].sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter max-w-2xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Next Due</p>
          {nextDue ? (
            <>
              <p className="font-display text-4xl text-primary mt-2">{nextDue.amount}</p>
              <p className="text-xs text-on-surface-variant mt-1">Due {nextDue.due_date}</p>
              <p className="text-xs text-on-surface-variant mt-2">Pay in person or via your guardian.</p>
            </>
          ) : (
            <p className="text-on-surface-variant mt-2">No dues outstanding.</p>
          )}
        </div>
      </div>
    </div>
  )
}
