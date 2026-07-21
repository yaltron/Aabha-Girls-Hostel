import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferStatusCard } from './TransferStatusCard'
import type { TransferRequest } from '../../lib/transfers'

const confirmTransfer = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  confirmTransfer: (...args: unknown[]) => confirmTransfer(...args),
}))

const baseRequest: TransferRequest = {
  id: 'req-1',
  student_id: 's-1',
  reason: 'Too noisy',
  preferred_room_type: 'single',
  status: 'pending',
  from_bed_id: 'bed-1',
  to_bed_id: null,
  price_diff: null,
  reject_reason: null,
  created_at: '2026-07-01T00:00:00Z',
}

describe('TransferStatusCard', () => {
  it('shows a pending message with no confirm button when status is pending', () => {
    render(<TransferStatusCard request={baseRequest} onConfirmed={vi.fn()} />)
    expect(screen.getByText(/pending review/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm/i })).not.toBeInTheDocument()
  })

  it('shows the price difference and a Confirm button when awaiting confirmation', async () => {
    const onConfirmed = vi.fn()
    const request = { ...baseRequest, status: 'awaiting_confirmation' as const, to_bed_id: 'bed-9', price_diff: 4000 }
    render(<TransferStatusCard request={request} onConfirmed={onConfirmed} />)

    expect(screen.getByText(/4000/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(() => expect(confirmTransfer).toHaveBeenCalledWith('req-1'))
    expect(onConfirmed).toHaveBeenCalled()
  })

  it('shows the reject reason when rejected', () => {
    const request = { ...baseRequest, status: 'rejected' as const, reject_reason: 'No vacancy' }
    render(<TransferStatusCard request={request} onConfirmed={vi.fn()} />)
    expect(screen.getByText('No vacancy')).toBeInTheDocument()
  })
})
