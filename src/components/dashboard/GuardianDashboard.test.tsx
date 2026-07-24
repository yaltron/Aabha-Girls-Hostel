import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GuardianDashboard } from './GuardianDashboard'

const rooms = [
  { id: 'room-1', room_number: '101', room_type_name: 'Twin', beds: [
    { id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'occupied', hold_until: null },
  ] },
]

const invoices = [
  { id: 'inv-1', billing_month: '2026-07-01', amount: 14000, due_date: '2026-08-01', status: 'unpaid' },
]

vi.mock('../../lib/rooms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/rooms')>()
  return { ...actual, fetchRoomsWithBeds: vi.fn(() => Promise.resolve(rooms)) }
})

vi.mock('../../lib/guardian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/guardian')>()
  return { ...actual, fetchChildInvoices: vi.fn(() => Promise.resolve(invoices)) }
})

describe('GuardianDashboard', () => {
  it('shows occupancy and next-due cards with a Pay Now button that reveals the payment form', async () => {
    render(<GuardianDashboard />)
    await waitFor(() => expect(screen.getByText('14000')).toBeInTheDocument())
    expect(screen.getByText('100%')).toBeInTheDocument()

    expect(screen.queryByRole('button', { name: /pay now/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))
    expect(screen.getByRole('button', { name: /^pay now$/i })).toBeInTheDocument()
  })
})
