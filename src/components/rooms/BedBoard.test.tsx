import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BedBoard } from './BedBoard'
import type { Room } from '../../lib/rooms'

const rooms: Room[] = [
  {
    id: 'room-1',
    room_number: '101',
    room_type_name: 'Twin',
    beds: [
      { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant', hold_until: null },
      { id: 'bed-2', room_id: 'room-1', bed_label: 'B', status: 'occupied', hold_until: null },
    ],
  },
]

describe('BedBoard', () => {
  it('renders every room number, room type, and bed label', () => {
    render(<BedBoard rooms={rooms} />)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('Twin')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('applies a distinct status class to vacant vs occupied beds', () => {
    render(<BedBoard rooms={rooms} />)
    const vacantBed = screen.getByText('A')
    const occupiedBed = screen.getByText('B')
    expect(vacantBed.className).not.toEqual(occupiedBed.className)
  })
})
