import { useEffect, useState } from 'react'
import { fetchRoomsWithStatus, type RoomWithStatus } from '../../lib/rooms'
import { fetchOpenTickets, type TicketWithStudent } from '../../lib/maintenance'
import { fetchPendingTransferRequests, type TransferRequestWithStudent } from '../../lib/transfers'
import { PendingTransferRequestsList } from './PendingTransferRequestsList'
import { RoomGrid } from '../rooms/RoomGrid'
import { TicketList } from '../maintenance/TicketList'

export function WardenDashboard() {
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [requests, setRequests] = useState<TransferRequestWithStudent[]>([])

  useEffect(() => {
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchOpenTickets().then(setTickets)
    fetchPendingTransferRequests().then(setRequests)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Welcome to Aabha Hostel</h2>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Open Complaints</h3>
        <TicketList tickets={tickets} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Pending Transfer Requests</h3>
        <PendingTransferRequestsList requests={requests} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Rooms</h3>
        <RoomGrid rooms={roomsWithStatus} role="warden" selectedRoomId={null} onSelectRoom={() => {}} />
      </div>
    </div>
  )
}
