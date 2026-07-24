import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OwnerDashboard } from './OwnerDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
    { id: 'bed-2', room_id: 'room-1', bed_label: 'B', status: 'vacant', hold_until: null },
  ] },
]

const roomsWithStatus = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'partially_filled' },
]

const invoices = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
]

const bookings = [
  { id: 'booking-1', name: 'Priya Sharma', phone: '9800000001', guardian_name: null, guardian_phone: '9800000002', emergency_contact_name: null, emergency_contact_phone: null, note: null, room_type: 'twin', preferred_date: '2026-08-01', status: 'pending', reserved_bed_id: null, created_at: '2026-07-20T00:00:00Z' },
]

const tickets = [
  { id: 'ticket-1', student_id: 's-2', description: 'Broken fan', status: 'open', created_at: '2026-07-20T00:00:00Z', student_name: 'Sita' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return {
    ...actual,
    fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)),
    fetchRoomsWithStatus: vi.fn(() => Promise.resolve(roomsWithStatus)),
  }
})

vi.mock('../../lib/fees', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/fees')>()
  return { ...actual, fetchDuesInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

vi.mock('../../lib/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/bookings')>()
  return { ...actual, fetchPendingBookings: vi.fn(() => Promise.resolve(bookings)) }
})

vi.mock('../../lib/maintenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/maintenance')>()
  return { ...actual, fetchOpenTickets: vi.fn(() => Promise.resolve(tickets)) }
})

describe('OwnerDashboard', () => {
  it('shows occupancy, vacant beds, and outstanding dues cards', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument())
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('14000')).toBeInTheDocument()
  })

  it('toggles the defaulter list when the dues card is clicked', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())

    expect(screen.queryByText('Anjali')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(/outstanding dues/i))
    expect(screen.getByText('Anjali')).toBeInTheDocument()
  })

  it('shows the pending bookings and open complaints action lists', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('Priya Sharma')).toBeInTheDocument())
    expect(screen.getByText('Broken fan')).toBeInTheDocument()
  })

  it('shows the room floor grid with no Edit/Delete controls', async () => {
    render(<OwnerDashboard />)
    await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
