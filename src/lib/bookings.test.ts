import { describe, it, expect, vi } from 'vitest'

const mockBookings = [
  { id: 'booking-1', name: 'Sita', phone: '9800000003', guardian_phone: '9800000004', room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-01T00:00:00Z' },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: mockBookings, error: null })) })),
      update: updateMock,
    })),
    rpc: rpcMock,
  },
}))

describe('fetchPendingBookings', () => {
  it('returns only pending bookings', async () => {
    const { fetchPendingBookings } = await import('./bookings')
    expect(await fetchPendingBookings()).toEqual(mockBookings)
  })
})

describe('approveBooking', () => {
  it('calls the approve_booking RPC with the booking and bed ids', async () => {
    const { approveBooking } = await import('./bookings')
    await approveBooking('booking-1', 'bed-5')
    expect(rpcMock).toHaveBeenCalledWith('approve_booking', { p_booking_id: 'booking-1', p_bed_id: 'bed-5' })
  })
})

describe('declineBooking', () => {
  it('updates the booking to declined', async () => {
    const { declineBooking } = await import('./bookings')
    await declineBooking('booking-1')
    expect(updateMock).toHaveBeenCalledWith({ status: 'declined' })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'booking-1')
  })
})
