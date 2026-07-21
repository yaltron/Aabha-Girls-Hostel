import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { calculateOccupancyRate } from '../lib/occupancy'

function DashboardPage() {
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 max-w-xs">
        <p className="text-xs uppercase tracking-wider text-secondary">Occupancy Rate</p>
        <p className="font-display text-4xl text-primary mt-2">{calculateOccupancyRate(rooms)}%</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})
