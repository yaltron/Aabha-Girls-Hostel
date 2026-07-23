import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomForm } from './RoomForm'
import type { RoomType, RoomWithStatus } from '../../lib/rooms'

const createRoom = vi.fn().mockResolvedValue(undefined)
const updateRoom = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/rooms', () => ({
  createRoom: (...args: unknown[]) => createRoom(...args),
  updateRoom: (...args: unknown[]) => updateRoom(...args),
}))

const roomTypes: RoomType[] = [
  { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: [] },
  { id: 'rt-2', name: 'Single', capacity: 1, base_rent: 18000, deposit: 5000, amenities: [] },
]

describe('RoomForm', () => {
  it('creates a new room with entered fields, defaulting to the first room type', async () => {
    const onSaved = vi.fn()
    render(<RoomForm roomTypes={roomTypes} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/room number/i), { target: { value: '303' } })
    fireEvent.change(screen.getByLabelText(/floor/i), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /add room/i }))

    await waitFor(() =>
      expect(createRoom).toHaveBeenCalledWith({
        room_number: '303',
        floor: 3,
        wing: null,
        room_type_id: 'rt-1',
        admin_status: 'active',
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('prefills from an existing room and calls updateRoom on save', async () => {
    const room: RoomWithStatus = { id: 'room-1', room_number: '101', floor: 1, wing: 'East', room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' }
    const onSaved = vi.fn()
    render(<RoomForm room={room} roomTypes={roomTypes} onSaved={onSaved} />)

    expect(screen.getByLabelText(/room number/i)).toHaveValue('101')
    expect(screen.getByLabelText(/wing/i)).toHaveValue('East')

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'under_maintenance' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateRoom).toHaveBeenCalledWith('room-1', {
        room_number: '101',
        floor: 1,
        wing: 'East',
        room_type_id: 'rt-1',
        admin_status: 'under_maintenance',
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an error when saving rejects', async () => {
    createRoom.mockRejectedValueOnce(new Error('Room number already exists'))
    render(<RoomForm roomTypes={roomTypes} onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/room number/i), { target: { value: '101' } })
    fireEvent.click(screen.getByRole('button', { name: /add room/i }))

    await waitFor(() => expect(screen.getByText('Room number already exists')).toBeInTheDocument())
  })
})
