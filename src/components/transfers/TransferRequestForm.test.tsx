import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TransferRequestForm } from './TransferRequestForm'

const submitTransferRequest = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/transfers', () => ({
  submitTransferRequest: (...args: unknown[]) => submitTransferRequest(...args),
}))

describe('TransferRequestForm', () => {
  it('calls submitTransferRequest with the entered fields on submit', async () => {
    const onSubmitted = vi.fn()
    render(<TransferRequestForm fromBedId="bed-1" onSubmitted={onSubmitted} />)

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Too noisy' } })
    fireEvent.change(screen.getByLabelText(/preferred room type/i), { target: { value: 'single' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() =>
      expect(submitTransferRequest).toHaveBeenCalledWith({
        fromBedId: 'bed-1',
        reason: 'Too noisy',
        preferredRoomType: 'single',
      }),
    )
    expect(onSubmitted).toHaveBeenCalled()
  })

  it('shows an error and does not call onSubmitted when submitTransferRequest rejects', async () => {
    submitTransferRequest.mockRejectedValueOnce(new Error('Submission failed'))
    const onSubmitted = vi.fn()
    render(<TransferRequestForm fromBedId="bed-1" onSubmitted={onSubmitted} />)

    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: 'Too noisy' } })
    fireEvent.click(screen.getByRole('button', { name: /submit request/i }))

    await waitFor(() => expect(screen.getByText('Submission failed')).toBeInTheDocument())
    expect(onSubmitted).not.toHaveBeenCalled()
  })
})
