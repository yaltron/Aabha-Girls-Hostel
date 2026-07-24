import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { WardenDashboard } from './WardenDashboard'

const roomsWithStatus = [
  { id: 'room-1', room_number: '101', floor: 1, wing: null, room_type_id: 'rt-1', admin_status: 'active', display_status: 'available' },
]

const tickets = [
  { id: 'ticket-1', student_id: 's-1', description: 'Broken fan', status: 'open', created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali' },
]

const requests = [
  { id: 'req-1', student_id: 's-1', reason: 'Noisy roommate', preferred_room_type: 'single', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null, reject_reason: null, created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithStatus: vi.fn(() => Promise.resolve(roomsWithStatus)) }
})

vi.mock('../../lib/maintenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/maintenance')>()
  return { ...actual, fetchOpenTickets: vi.fn(() => Promise.resolve(tickets)) }
})

vi.mock('../../lib/transfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/transfers')>()
  return { ...actual, fetchPendingTransferRequests: vi.fn(() => Promise.resolve(requests)) }
})

describe('WardenDashboard', () => {
  it('shows open complaints, pending transfer requests, and the read-only room grid', async () => {
    render(<WardenDashboard />)
    await waitFor(() => expect(screen.getByText('Broken fan')).toBeInTheDocument())
    expect(screen.getByText('Noisy roommate')).toBeInTheDocument()
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
  })
})
