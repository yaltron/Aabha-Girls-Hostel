import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchStudents, type Student } from '../lib/students'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { fetchMyTransferRequests, type TransferRequest } from '../lib/transfers'
import { TransferRequestForm } from '../components/transfers/TransferRequestForm'
import { TransferStatusCard } from '../components/transfers/TransferStatusCard'

function MyRoomPage() {
  const [student, setStudent] = useState<Student | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRequest, setActiveRequest] = useState<TransferRequest | null>(null)

  function refetch() {
    fetchStudents().then((students) => setStudent(students[0] ?? null))
    fetchRoomsWithBeds().then(setRooms)
    fetchMyTransferRequests().then((requests) => {
      const active = requests.find((r) => r.status === 'pending' || r.status === 'awaiting_confirmation' || r.status === 'rejected')
      setActiveRequest(active ?? null)
    })
  }

  useEffect(() => {
    refetch()
  }, [])

  if (!student) return null

  const currentRoom = rooms.find((r) => r.beds.some((b) => b.id === student.bed_id))
  const currentBed = currentRoom?.beds.find((b) => b.id === student.bed_id)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">My Room</h2>
      {currentRoom && currentBed && (
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8">
          <p className="text-xs uppercase tracking-wider text-secondary">Current Room</p>
          <p className="font-display text-2xl text-primary mt-2">{currentRoom.room_number} - Bed {currentBed.bed_label}</p>
        </div>
      )}
      {activeRequest ? (
        <TransferStatusCard request={activeRequest} onConfirmed={refetch} />
      ) : (
        student.bed_id && <TransferRequestForm fromBedId={student.bed_id} onSubmitted={refetch} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-room')({
  component: MyRoomPage,
})
