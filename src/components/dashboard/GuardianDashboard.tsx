import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../../lib/rooms'
import { fetchChildInvoices, type ChildInvoice } from '../../lib/guardian'
import { calculateOccupancyRate } from '../../lib/occupancy'
import { GuardianPaymentForm } from '../guardian/GuardianPaymentForm'

export function GuardianDashboard() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [invoices, setInvoices] = useState<ChildInvoice[]>([])
  const [paying, setPaying] = useState(false)

  function refetchInvoices() {
    fetchChildInvoices().then(setInvoices)
  }

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    refetchInvoices()
  }, [])

  const nextDue = [...invoices].filter((invoice) => invoice.status === 'unpaid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0]

  function handlePaid() {
    setPaying(false)
    refetchInvoices()
  }

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
              {!paying && (
                <button
                  type="button"
                  onClick={() => setPaying(true)}
                  className="mt-4 bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
                >
                  Pay Now
                </button>
              )}
            </>
          ) : (
            <p className="text-on-surface-variant mt-2">No dues outstanding.</p>
          )}
        </div>
      </div>

      {paying && nextDue && <GuardianPaymentForm invoiceId={nextDue.id} onPaid={handlePaid} />}
    </div>
  )
}
