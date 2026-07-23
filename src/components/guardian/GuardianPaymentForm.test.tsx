import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GuardianPaymentForm } from './GuardianPaymentForm'

const payGuardianInvoice = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/guardian', () => ({
  payGuardianInvoice: (...args: unknown[]) => payGuardianInvoice(...args),
}))

describe('GuardianPaymentForm', () => {
  it('calls payGuardianInvoice with the entered method and reference', async () => {
    const onPaid = vi.fn()
    render(<GuardianPaymentForm invoiceId="inv-1" onPaid={onPaid} />)

    fireEvent.change(screen.getByLabelText(/method/i), { target: { value: 'khalti' } })
    fireEvent.change(screen.getByLabelText(/reference/i), { target: { value: 'TXN456' } })
    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))

    await waitFor(() => expect(payGuardianInvoice).toHaveBeenCalledWith('inv-1', 'khalti', 'TXN456'))
    expect(onPaid).toHaveBeenCalled()
  })

  it('shows an error and does not call onPaid when payGuardianInvoice rejects', async () => {
    payGuardianInvoice.mockRejectedValueOnce(new Error('Payment failed'))
    const onPaid = vi.fn()
    render(<GuardianPaymentForm invoiceId="inv-1" onPaid={onPaid} />)

    fireEvent.click(screen.getByRole('button', { name: /pay now/i }))

    await waitFor(() => expect(screen.getByText('Payment failed')).toBeInTheDocument())
    expect(onPaid).not.toHaveBeenCalled()
  })
})
