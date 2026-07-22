import { describe, it, expect, vi } from 'vitest'

const mockBookings = [
  { id: 'booking-1', name: 'Sita', phone: '9800000003', guardian_phone: '9800000004', room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-01T00:00:00Z' },
]

const mockApprovedBookings = [
  { id: 'booking-2', name: 'Ram', phone: '9800000005', guardian_phone: '9800000006', room_type: 'single', preferred_date: '2026-08-02', status: 'approved', reserved_bed_id: 'bed-9', created_at: '2026-07-02T00:00:00Z' },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))
const selectEqMock = vi.fn((_column: string, value: string) =>
  Promise.resolve({ data: value === 'approved' ? mockApprovedBookings : mockBookings, error: null })
)

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: selectEqMock })),
      update: updateMock,
    })),
    rpc: rpcMock,
  },
}))

describe('fetchPendingBookings', () => {
  it('returns only pending bookings', async () => {
    const { fetchPendingBookings } = await import('./bookings')
    expect(await fetchPendingBookings()).toEqual(mockBookings)
    expect(selectEqMock).toHaveBeenCalledWith('status', 'pending')
  })
})

describe('fetchApprovedBookings', () => {
  it('returns only approved bookings', async () => {
    const { fetchApprovedBookings } = await import('./bookings')
    expect(await fetchApprovedBookings()).toEqual(mockApprovedBookings)
    expect(selectEqMock).toHaveBeenCalledWith('status', 'approved')
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
