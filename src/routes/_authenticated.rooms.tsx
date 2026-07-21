import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { BedBoard } from '../components/rooms/BedBoard'

function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    fetchRoomsWithBeds().then(setRooms)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Rooms</h2>
      <BedBoard rooms={rooms} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/rooms')({
  component: RoomsPage,
})
