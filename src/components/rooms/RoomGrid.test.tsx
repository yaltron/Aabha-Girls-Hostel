import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RoomGrid } from './RoomGrid'
import type { RoomWithStatus } from '../../lib/rooms'

const rooms: RoomWithStatus[] = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
  { id: 'room-2', room_number: '102', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'full' },
]

describe('RoomGrid', () => {
  it('renders every room number and its display status', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.getByText('102')).toBeInTheDocument()
    expect(screen.getByText('available')).toBeInTheDocument()
    expect(screen.getByText('full')).toBeInTheDocument()
  })

  it('applies a distinct status class per display_status', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    const availableTile = screen.getByText('101').closest('div')
    const fullTile = screen.getByText('102').closest('div')
    expect(availableTile?.className).not.toEqual(fullTile?.className)
  })

  it('calls onSelectRoom when a tile is clicked', () => {
    const onSelectRoom = vi.fn()
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={onSelectRoom} />)
    fireEvent.click(screen.getByText('101'))
    expect(onSelectRoom).toHaveBeenCalledWith('room-1')
  })

  it('shows Edit and Delete controls for owner but not warden', () => {
    const { rerender } = render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} onEditRoom={vi.fn()} onDeleteRoom={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: /edit/i })).toHaveLength(2)

    rerender(<RoomGrid rooms={rooms} role="warden" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })

  it('calls onEditRoom with the room and does not also trigger onSelectRoom', () => {
    const onSelectRoom = vi.fn()
    const onEditRoom = vi.fn()
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={onSelectRoom} onEditRoom={onEditRoom} onDeleteRoom={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0])
    expect(onEditRoom).toHaveBeenCalledWith(rooms[0])
    expect(onSelectRoom).not.toHaveBeenCalled()
  })

  it('does not show Edit/Delete for owner when no callbacks are provided (read-only embedding)', () => {
    render(<RoomGrid rooms={rooms} role="owner" selectedRoomId={null} onSelectRoom={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })
})
