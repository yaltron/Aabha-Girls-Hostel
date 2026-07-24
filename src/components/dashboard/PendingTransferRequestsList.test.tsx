import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PendingTransferRequestsList } from './PendingTransferRequestsList'
import type { TransferRequestWithStudent } from '../../lib/transfers'

const requests: TransferRequestWithStudent[] = [
  {
    id: 'req-1', student_id: 's-1', reason: 'Noisy roommate', preferred_room_type: 'single',
    status: 'pending', from_bed_id: 'bed-1', to_bed_id: null, price_diff: null,
    reject_reason: null, created_at: '2026-07-20T00:00:00Z', student_name: 'Anjali Adhikari',
  },
]

describe('PendingTransferRequestsList', () => {
  it('renders each request with student name, reason, and preferred room type', () => {
    render(<PendingTransferRequestsList requests={requests} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('Noisy roommate')).toBeInTheDocument()
    expect(screen.getByText('single')).toBeInTheDocument()
  })

  it('links each row to the requests review screen', () => {
    render(<PendingTransferRequestsList requests={requests} />)
    expect(screen.getByRole('link', { name: /review/i })).toHaveAttribute('href', '/requests')
  })

  it('shows an empty message when there are no pending requests', () => {
    render(<PendingTransferRequestsList requests={[]} />)
    expect(screen.getByText(/no pending transfer requests/i)).toBeInTheDocument()
  })
})
