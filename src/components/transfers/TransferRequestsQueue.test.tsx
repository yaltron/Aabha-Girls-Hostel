import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferRequestsQueue } from './TransferRequestsQueue'
import type { TransferRequestWithStudent } from '../../lib/transfers'
import type { Bed } from '../../lib/rooms'

const approveTransferRequest = vi.fn().mockResolvedValue(undefined)
const rejectTransferRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  approveTransferRequest: (...args: unknown[]) => approveTransferRequest(...args),
  rejectTransferRequest: (...args: unknown[]) => rejectTransferRequest(...args),
}))

const requests: TransferRequestWithStudent[] = [
  {
    id: 'req-1', student_id: 's-1', student_name: 'Sita Nepali', reason: 'Roommate conflict',
    preferred_room_type: 'twin', status: 'pending', from_bed_id: 'bed-1', to_bed_id: null,
    price_diff: null, reject_reason: null, created_at: '2026-07-01T00:00:00Z',
  },
]

const vacantBeds: Bed[] = [{ id: 'bed-9', room_id: 'room-9', bed_label: 'A', status: 'vacant' }]
const vacantBedsByType = vi.fn(() => vacantBeds)

describe('TransferRequestsQueue', () => {
  it('renders the student name, reason, and a bed picker limited to vacantBedsByType', () => {
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={vi.fn()} />)
    expect(screen.getByText('Sita Nepali')).toBeInTheDocument()
    expect(screen.getByText('Roommate conflict')).toBeInTheDocument()
    expect(vacantBedsByType).toHaveBeenCalledWith('twin')
  })

  it('approves with the selected bed and calls onDecided', async () => {
    const onDecided = vi.fn()
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={onDecided} />)

    fireEvent.change(screen.getByLabelText(/assign bed/i), { target: { value: 'bed-9' } })
    fireEvent.click(screen.getByRole('button', { name: /approve/i }))

    await waitFor(() => expect(approveTransferRequest).toHaveBeenCalledWith('req-1', 'bed-9'))
    expect(onDecided).toHaveBeenCalled()
  })

  it('rejects with the entered reason and calls onDecided', async () => {
    const onDecided = vi.fn()
    render(<TransferRequestsQueue requests={requests} vacantBedsByType={vacantBedsByType} onDecided={onDecided} />)

    fireEvent.change(screen.getByLabelText(/reject reason/i), { target: { value: 'No vacancy' } })
    fireEvent.click(screen.getByRole('button', { name: /reject/i }))

    await waitFor(() => expect(rejectTransferRequest).toHaveBeenCalledWith('req-1', 'No vacancy'))
    expect(onDecided).toHaveBeenCalled()
  })
})
