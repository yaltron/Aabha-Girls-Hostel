import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookingsQueue } from './BookingsQueue'
import type { Booking } from '../../lib/bookings'
import type { Bed } from '../../lib/rooms'

const approveBooking = vi.fn().mockResolvedValue(undefined)
const declineBooking = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/bookings', () => ({
  approveBooking: (...args: unknown[]) => approveBooking(...args),
  declineBooking: (...args: unknown[]) => declineBooking(...args),
}))

const bookings: Booking[] = [
  { id: 'booking-1', name: 'Sita', phone: '9800000003', guardian_phone: '9800000004', room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-01T00:00:00Z', guardian_name: null, emergency_contact_name: null, emergency_contact_phone: null, note: null },
]

const vacantBeds: Bed[] = [{ id: 'bed-5', room_id: 'room-2', bed_label: 'B', status: 'vacant' }]

describe('BookingsQueue', () => {
  it('approves a booking with the selected bed', async () => {
    const onDecided = vi.fn()
    render(<BookingsQueue bookings={bookings} vacantBedsByType={() => vacantBeds} onDecided={onDecided} />)

    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(approveBooking).toHaveBeenCalledWith('booking-1', 'bed-5'))
    expect(onDecided).toHaveBeenCalled()
  })

  it('declines a booking', async () => {
    const onDecided = vi.fn()
    render(<BookingsQueue bookings={bookings} vacantBedsByType={() => vacantBeds} onDecided={onDecided} />)

    fireEvent.click(screen.getByRole('button', { name: /decline/i }))

    await waitFor(() => expect(declineBooking).toHaveBeenCalledWith('booking-1'))
    expect(onDecided).toHaveBeenCalled()
  })

  it('shows guardian name, emergency contact, and note when present', () => {
    const bookingWithDetails: Booking = {
      ...bookings[0],
      guardian_name: 'Guardian Sharma',
      emergency_contact_name: 'Aunt Gita',
      emergency_contact_phone: '9800000099',
      note: 'Arriving by evening bus',
    }
    render(<BookingsQueue bookings={[bookingWithDetails]} vacantBedsByType={() => vacantBeds} onDecided={vi.fn()} />)
    expect(screen.getByText(/Guardian Sharma/)).toBeInTheDocument()
    expect(screen.getByText(/Aunt Gita/)).toBeInTheDocument()
    expect(screen.getByText(/Arriving by evening bus/)).toBeInTheDocument()
  })
})
