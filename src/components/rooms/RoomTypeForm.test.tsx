import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RoomTypeForm } from './RoomTypeForm'
import type { RoomType } from '../../lib/rooms'

const createRoomType = vi.fn().mockResolvedValue(undefined)
const updateRoomType = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/rooms', () => ({
  createRoomType: (...args: unknown[]) => createRoomType(...args),
  updateRoomType: (...args: unknown[]) => updateRoomType(...args),
}))

describe('RoomTypeForm', () => {
  it('creates a new room type with entered fields and toggled amenities', async () => {
    const onSaved = vi.fn()
    render(<RoomTypeForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Dormitory' } })
    fireEvent.change(screen.getByLabelText(/capacity/i), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/monthly rent/i), { target: { value: '8000' } })
    fireEvent.change(screen.getByLabelText(/security deposit/i), { target: { value: '2000' } })
    fireEvent.click(screen.getByLabelText(/balcony/i))
    fireEvent.click(screen.getByRole('button', { name: /add room type/i }))

    await waitFor(() =>
      expect(createRoomType).toHaveBeenCalledWith({
        name: 'Dormitory',
        capacity: 6,
        base_rent: 8000,
        deposit: 2000,
        amenities: ['balcony'],
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('prefills from an existing room type and calls updateRoomType on save', async () => {
    const roomType: RoomType = { id: 'rt-1', name: 'Twin', capacity: 2, base_rent: 14000, deposit: 5000, amenities: ['balcony'] }
    const onSaved = vi.fn()
    render(<RoomTypeForm roomType={roomType} onSaved={onSaved} />)

    expect(screen.getByLabelText(/name/i)).toHaveValue('Twin')
    expect(screen.getByLabelText(/balcony/i)).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateRoomType).toHaveBeenCalledWith('rt-1', {
        name: 'Twin',
        capacity: 2,
        base_rent: 14000,
        deposit: 5000,
        amenities: ['balcony'],
      }),
    )
    expect(onSaved).toHaveBeenCalled()
  })

  it('shows an error when saving rejects', async () => {
    createRoomType.mockRejectedValueOnce(new Error('Room type name already exists'))
    render(<RoomTypeForm onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Twin' } })
    fireEvent.click(screen.getByRole('button', { name: /add room type/i }))

    await waitFor(() => expect(screen.getByText('Room type name already exists')).toBeInTheDocument())
  })
})
