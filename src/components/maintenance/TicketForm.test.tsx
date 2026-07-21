import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TicketForm } from './TicketForm'

const raiseTicket = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/maintenance', () => ({
  raiseTicket: (...args: unknown[]) => raiseTicket(...args),
}))

describe('TicketForm', () => {
  it('calls raiseTicket with the entered description on submit', async () => {
    const onRaised = vi.fn()
    render(<TicketForm onRaised={onRaised} />)

    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Leaky faucet' } })
    fireEvent.click(screen.getByRole('button', { name: /raise ticket/i }))

    await waitFor(() => expect(raiseTicket).toHaveBeenCalledWith('Leaky faucet'))
    expect(onRaised).toHaveBeenCalled()
  })
})
