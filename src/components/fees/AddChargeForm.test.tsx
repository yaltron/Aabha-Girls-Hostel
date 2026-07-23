import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddChargeForm } from './AddChargeForm'
import type { FeeHead } from '../../lib/fees'

const addInvoiceItem = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/fees', () => ({
  addInvoiceItem: (...args: unknown[]) => addInvoiceItem(...args),
}))

const feeHeads: FeeHead[] = [
  { id: 'fh-1', name: 'Rent', is_recurring: true },
  { id: 'fh-2', name: 'Mess Charge', is_recurring: false },
]

describe('AddChargeForm', () => {
  it('adds a charge with the entered fields, defaulting to the first fee head', async () => {
    const onAdded = vi.fn()
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={onAdded} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Late night pass' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(addInvoiceItem).toHaveBeenCalledWith('invoice-1', 'fh-1', 500, 'Late night pass'))
    expect(onAdded).toHaveBeenCalled()
  })

  it('sends undefined description when left blank', async () => {
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(addInvoiceItem).toHaveBeenCalledWith('invoice-1', 'fh-1', 500, undefined))
  })

  it('shows an error when adding rejects', async () => {
    addInvoiceItem.mockRejectedValueOnce(new Error('Invoice invoice-1 is not unpaid'))
    render(<AddChargeForm invoiceId="invoice-1" feeHeads={feeHeads} onAdded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: /add charge/i }))

    await waitFor(() => expect(screen.getByText('Invoice invoice-1 is not unpaid')).toBeInTheDocument())
  })
})
