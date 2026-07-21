import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { calculateOccupancyRate } from '../lib/occupancy'
import { calculateFeesCollectedThisMonth } from '../lib/dues'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

async function fetchAllPayments(): Promise<Array<{ amount: number; paid_at: string }>> {
  const { data, error } = await supabase.from('payments').select('amount, paid_at')
  if (error) throw error
  return data ?? []
}

function DashboardPage() {
  const { role } = useAuth()
  const [rooms, setRooms] = useState<Room[]>([])
  const [payments, setPayments] = useState<Array<{ amount: number; paid_at: string }>>([])
  const canSeeFeesCollected = role === 'owner' || role === 'warden'

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
    if (canSeeFeesCollected) {
      fetchAllPayments().then(setPayments)
    }
  }, [canSeeFeesCollected])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter max-w-2xl">
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
          <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
        </div>
        {canSeeFeesCollected && (
          <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
            <p className="text-xs uppercase tracking-wider text-secondary">Fees Collected</p>
            <p className="font-display text-4xl text-primary mt-2">{calculateFeesCollectedThisMonth(payments, new Date())}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})
