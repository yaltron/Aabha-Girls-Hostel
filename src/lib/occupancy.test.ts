import { describe, it, expect } from 'vitest'
import { calculateOccupancyRate } from './occupancy'
import type { Room } from './rooms'

function room(beds: Array<{ status: Room['beds'][number]['status'] }>): Room {
  return {
    id: 'r', room_number: '1', room_type_name: 'Twin',
    beds: beds.map((b, i) => ({ id: `b${i}`, room_id: 'r', bed_label: String(i), status: b.status, hold_until: null })),
  }
}

describe('calculateOccupancyRate', () => {
  it('returns 0 when there are no beds', () => {
    expect(calculateOccupancyRate([])).toBe(0)
  })

  it('calculates the percentage of occupied beds', () => {
    const rooms = [room([{ status: 'occupied' }, { status: 'vacant' }, { status: 'occupied' }, { status: 'vacant' }])]
    expect(calculateOccupancyRate(rooms)).toBe(50)
  })

  it('rounds to the nearest whole number', () => {
    const rooms = [room([{ status: 'occupied' }, { status: 'vacant' }, { status: 'vacant' }])]
    expect(calculateOccupancyRate(rooms)).toBe(33)
  })
})
