import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PendingBookingsList } from './PendingBookingsList'
import type { Booking } from '../../lib/bookings'

const bookings: Booking[] = [
  {
    id: 'booking-1', name: 'Priya Sharma', phone: '9800000001', guardian_name: null,
    guardian_phone: '9800000002', emergency_contact_name: null, emergency_contact_phone: null,
    note: null, room_type: 'twin', preferred_date: '2026-08-01', status: 'pending',
    reserved_bed_id: null, created_at: '2026-07-20T00:00:00Z',
  },
]

describe('PendingBookingsList', () => {
  it('renders each booking with name, phone, room type, and preferred date', () => {
    render(<PendingBookingsList bookings={bookings} />)
    expect(screen.getByText('Priya Sharma')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
    expect(screen.getByText('twin')).toBeInTheDocument()
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
  })

  it('links each row to the site-content review screen', () => {
    render(<PendingBookingsList bookings={bookings} />)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/site-content')
  })

  it('shows an empty message when there are no pending bookings', () => {
    render(<PendingBookingsList bookings={[]} />)
    expect(screen.getByText(/no pending bookings/i)).toBeInTheDocument()
  })
})
