import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeeHeadForm } from './FeeHeadForm'

const createFeeHead = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/fees', () => ({
  createFeeHead: (...args: unknown[]) => createFeeHead(...args),
}))

describe('FeeHeadForm', () => {
  it('creates a fee head with the entered name and recurring flag, then resets the form', async () => {
    const onSaved = vi.fn()
    render(<FeeHeadForm onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Mess Charge' } })
    fireEvent.click(screen.getByLabelText(/recurring/i))
    fireEvent.click(screen.getByRole('button', { name: /add fee head/i }))

    await waitFor(() => expect(createFeeHead).toHaveBeenCalledWith('Mess Charge', true))
    expect(onSaved).toHaveBeenCalled()
    expect(screen.getByLabelText(/name/i)).toHaveValue('')
  })

  it('shows an error when saving rejects', async () => {
    createFeeHead.mockRejectedValueOnce(new Error('Fee head name already exists'))
    render(<FeeHeadForm onSaved={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Rent' } })
    fireEvent.click(screen.getByRole('button', { name: /add fee head/i }))

    await waitFor(() => expect(screen.getByText('Fee head name already exists')).toBeInTheDocument())
  })
})
