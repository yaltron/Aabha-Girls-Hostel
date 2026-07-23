import { useState, type FormEvent } from 'react'
import { createRoom, updateRoom, type RoomAdminStatus, type RoomType, type RoomWithStatus } from '../../lib/rooms'

export function RoomForm({ room, roomTypes, onSaved }: { room?: RoomWithStatus; roomTypes: RoomType[]; onSaved: () => void }) {
  const [roomNumber, setRoomNumber] = useState(room?.room_number ?? '')
  const [floor, setFloor] = useState(room?.floor ?? 0)
  const [wing, setWing] = useState(room?.wing ?? '')
  const [roomTypeId, setRoomTypeId] = useState(room?.room_type_id ?? roomTypes[0]?.id ?? '')
  const [adminStatus, setAdminStatus] = useState<RoomAdminStatus>(room?.admin_status ?? 'active')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const input = { room_number: roomNumber, floor, wing: wing || null, room_type_id: roomTypeId, admin_status: adminStatus }
      if (room) {
        await updateRoom(room.id, input)
      } else {
        await createRoom(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="roomNumber" className="block text-sm font-medium text-on-surface-variant">Room Number</label>
        <input id="roomNumber" value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomFloor" className="block text-sm font-medium text-on-surface-variant">Floor</label>
        <input id="roomFloor" type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomWing" className="block text-sm font-medium text-on-surface-variant">Wing (optional)</label>
        <input id="roomWing" value={wing} onChange={(e) => setWing(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeSelect" className="block text-sm font-medium text-on-surface-variant">Room Type</label>
        <select id="roomTypeSelect" value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required>
          {roomTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>{rt.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="roomAdminStatus" className="block text-sm font-medium text-on-surface-variant">Status</label>
        <select id="roomAdminStatus" value={adminStatus} onChange={(e) => setAdminStatus(e.target.value as RoomAdminStatus)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
          <option value="active">Active</option>
          <option value="under_maintenance">Under Maintenance</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        {room ? 'Save Changes' : 'Add Room'}
      </button>
    </form>
  )
}
