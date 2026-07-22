import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPendingTransferRequests, type TransferRequestWithStudent } from '../lib/transfers'
import { fetchOpenTickets, resolveTicket, type TicketWithStudent } from '../lib/maintenance'
import { fetchNotices, type Notice } from '../lib/notices'
import { fetchRoomsWithBeds, type Room, type Bed } from '../lib/rooms'
import { TransferRequestsQueue } from '../components/transfers/TransferRequestsQueue'
import { TicketList } from '../components/maintenance/TicketList'
import { PostNoticeForm } from '../components/notices/PostNoticeForm'
import { NoticesList } from '../components/notices/NoticesList'

function RequestsPage() {
  const [transferRequests, setTransferRequests] = useState<TransferRequestWithStudent[]>([])
  const [tickets, setTickets] = useState<TicketWithStudent[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [rooms, setRooms] = useState<Room[]>([])

  function refetch() {
    fetchPendingTransferRequests().then(setTransferRequests)
    fetchOpenTickets().then(setTickets)
    fetchNotices().then(setNotices)
    fetchRoomsWithBeds().then(setRooms)
  }

  useEffect(() => {
    refetch()
  }, [])

  function vacantBedsByType(roomType: TransferRequestWithStudent['preferred_room_type']): Bed[] {
    return rooms
      .filter((r) => r.room_type === roomType)
      .flatMap((r) => r.beds)
      .filter((b) => b.status === 'vacant')
  }

  async function handleResolve(ticketId: string) {
    await resolveTicket(ticketId)
    refetch()
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Requests</h2>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Transfer Requests</h3>
        <TransferRequestsQueue requests={transferRequests} vacantBedsByType={vacantBedsByType} onDecided={refetch} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Maintenance Tickets</h3>
        <TicketList tickets={tickets} onResolve={handleResolve} />
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-lg text-on-surface">Notices</h3>
        <PostNoticeForm onPosted={refetch} />
        <NoticesList notices={notices} />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/requests')({
  component: RequestsPage,
})
