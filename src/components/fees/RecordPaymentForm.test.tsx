import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecordPaymentForm } from './RecordPaymentForm'

const recordPayment = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/fees', () => ({
  recordPayment: (...args: unknown[]) => recordPayment(...args),
}))

describe('RecordPaymentForm', () => {
  it('calls recordPayment with the entered method/reference and default amount', async () => {
    const onRecorded = vi.fn()
    render(<RecordPaymentForm invoiceId="invoice-1" defaultAmount={14000} onRecorded={onRecorded} />)

    fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'esewa' } })
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'TXN123' } })
    fireEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await waitFor(() =>
      expect(recordPayment).toHaveBeenCalledWith({
        invoiceId: 'invoice-1',
        amount: 14000,
        method: 'esewa',
        reference: 'TXN123',
      }),
    )
    expect(onRecorded).toHaveBeenCalled()
  })

  it('shows an error and does not call onRecorded when recordPayment rejects', async () => {
    recordPayment.mockRejectedValueOnce(new Error('Payment failed'))
    const onRecorded = vi.fn()
    render(<RecordPaymentForm invoiceId="invoice-1" defaultAmount={14000} onRecorded={onRecorded} />)

    fireEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await waitFor(() => expect(screen.getByText('Payment failed')).toBeInTheDocument())
    expect(onRecorded).not.toHaveBeenCalled()
  })
})
