import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { StudentDashboard } from './StudentDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
  ] },
]

const invoices = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2026-08-01', status: 'unpaid' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)) }
})

vi.mock('../../lib/fees', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/fees')>()
  return { ...actual, fetchDuesInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

describe('StudentDashboard', () => {
  it('shows occupancy and next-due cards with no pay action', async () => {
    render(<StudentDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText(/2026-08-01/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument()
  })
})
