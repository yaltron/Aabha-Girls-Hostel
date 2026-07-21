import type { Room } from './rooms'

export function calculateOccupancyRate(rooms: Room[]): number {
  const allBeds = rooms.flatMap((room) => room.beds)
  if (allBeds.length === 0) return 0
  const occupied = allBeds.filter((bed) => bed.status === 'occupied').length
  return Math.round((occupied / allBeds.length) * 100)
}
