import type { Bed, BedStatus, Room } from '../../lib/rooms'

const STATUS_CLASSES: Record<BedStatus, string> = {
  vacant: 'bg-secondary-container text-on-secondary-container',
  occupied: 'bg-primary text-on-primary',
  reserved: 'bg-surface-container-highest text-on-surface-variant',
  notice_given: 'bg-error-container text-on-error-container',
}

function BedTile({ bed }: { bed: Bed }) {
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-medium text-sm ${STATUS_CLASSES[bed.status]}`}>
      {bed.bed_label}
    </span>
  )
}

export function BedBoard({ rooms }: { rooms: Room[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
      {rooms.map((room) => (
        <div key={room.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-display text-lg text-primary">{room.room_number}</h3>
            <span className="text-xs uppercase tracking-wider text-secondary">{room.room_type}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {room.beds.map((bed) => (
              <BedTile key={bed.id} bed={bed} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
