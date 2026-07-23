import type { RoomDisplayStatus, RoomWithStatus } from '../../lib/rooms'
import type { Role } from '../../lib/nav'

const STATUS_CLASSES: Record<RoomDisplayStatus, string> = {
  available: 'bg-secondary-container text-on-secondary-container',
  partially_filled: 'bg-tertiary-container text-on-tertiary-container',
  full: 'bg-primary text-on-primary',
  under_maintenance: 'bg-surface-container-highest text-on-surface-variant',
  blocked: 'bg-error-container text-on-error-container',
}

export function RoomGrid({
  rooms,
  role,
  selectedRoomId,
  onSelectRoom,
  onEditRoom,
  onDeleteRoom,
}: {
  rooms: RoomWithStatus[]
  role: Role
  selectedRoomId: string | null
  onSelectRoom: (roomId: string) => void
  onEditRoom?: (room: RoomWithStatus) => void
  onDeleteRoom?: (room: RoomWithStatus) => void
}) {
  const canManage = role === 'owner'

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-gutter">
      {rooms.map((room) => (
        <div
          key={room.id}
          className={`rounded-xxl shadow-premium p-4 space-y-2 cursor-pointer ${STATUS_CLASSES[room.display_status]} ${selectedRoomId === room.id ? 'ring-2 ring-primary' : ''}`}
          onClick={() => onSelectRoom(room.id)}
        >
          <p className="font-display text-lg">{room.room_number}</p>
          <p className="text-xs uppercase tracking-wider">{room.display_status.replace('_', ' ')}</p>
          {canManage && (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEditRoom?.(room)
                }}
                className="underline"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteRoom?.(room)
                }}
                className="underline"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
