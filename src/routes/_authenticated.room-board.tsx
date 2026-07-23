import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchRoomsWithBeds, fetchRoomsWithStatus, fetchRoomTypes, deleteRoom, type Room, type RoomType, type RoomWithStatus } from '../lib/rooms'
import { useAuth } from '../lib/auth'
import { RoomGrid } from '../components/rooms/RoomGrid'
import { RoomForm } from '../components/rooms/RoomForm'
import { RoomTypeForm } from '../components/rooms/RoomTypeForm'
import { BedBoard } from '../components/rooms/BedBoard'

function RoomsPage() {
  const { role } = useAuth()
  const [roomsWithStatus, setRoomsWithStatus] = useState<RoomWithStatus[]>([])
  const [roomsWithBeds, setRoomsWithBeds] = useState<Room[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [editingRoom, setEditingRoom] = useState<RoomWithStatus | null>(null)
  const [addingRoom, setAddingRoom] = useState(false)
  const [editingRoomType, setEditingRoomType] = useState<RoomType | null>(null)
  const [addingRoomType, setAddingRoomType] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoomWithStatus | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function refetchAll() {
    fetchRoomsWithStatus().then(setRoomsWithStatus)
    fetchRoomsWithBeds().then(setRoomsWithBeds)
    fetchRoomTypes().then(setRoomTypes)
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function closeForms() {
    setEditingRoom(null)
    setAddingRoom(false)
    setEditingRoomType(null)
    setAddingRoomType(false)
  }

  function handleSaved() {
    closeForms()
    refetchAll()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteError(null)
    try {
      await deleteRoom(deleteTarget.id)
      setDeleteTarget(null)
      refetchAll()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete room')
    }
  }

  // AdminShell (the parent layout) already gates rendering on role being
  // non-null before this component ever mounts - this guard narrows the
  // type for RoomGrid's role: Role prop, mirroring AdminShell's own
  // `if (!role) return null` pattern rather than leaving the mismatch.
  if (!role) return null

  const canManage = role === 'owner'
  const selectedRoom = roomsWithBeds.find((r) => r.id === selectedRoomId)

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Rooms</h2>

      {canManage && (
        <div className="flex gap-4">
          <button type="button" onClick={() => setAddingRoomType(true)} className="text-primary font-medium hover:underline">
            Add Room Type
          </button>
          <button type="button" onClick={() => setAddingRoom(true)} disabled={roomTypes.length === 0} className="text-primary font-medium hover:underline disabled:opacity-50">
            Add Room
          </button>
        </div>
      )}

      {(addingRoomType || editingRoomType) && (
        <RoomTypeForm roomType={editingRoomType ?? undefined} onSaved={handleSaved} />
      )}

      {(addingRoom || editingRoom) && (
        <RoomForm room={editingRoom ?? undefined} roomTypes={roomTypes} onSaved={handleSaved} />
      )}

      {deleteTarget && (
        <div className="bg-error-container rounded-xxl p-6 space-y-4">
          <p className="text-on-error-container">Delete room {deleteTarget.room_number}? This cannot be undone.</p>
          {deleteError && <p className="text-error text-sm">{deleteError}</p>}
          <div className="flex gap-4">
            <button type="button" onClick={confirmDelete} className="text-error font-medium hover:underline">
              Confirm Delete
            </button>
            <button type="button" onClick={() => { setDeleteTarget(null); setDeleteError(null) }} className="text-on-surface-variant hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      <RoomGrid
        rooms={roomsWithStatus}
        role={role}
        selectedRoomId={selectedRoomId}
        onSelectRoom={(roomId) => setSelectedRoomId(roomId === selectedRoomId ? null : roomId)}
        onEditRoom={canManage ? setEditingRoom : undefined}
        onDeleteRoom={canManage ? setDeleteTarget : undefined}
      />

      {selectedRoom && <BedBoard rooms={[selectedRoom]} />}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/room-board')({
  component: RoomsPage,
})
