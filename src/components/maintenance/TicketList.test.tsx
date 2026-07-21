import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TicketList } from './TicketList'
import type { Ticket } from '../../lib/maintenance'

const tickets: Ticket[] = [
  { id: 'ticket-1', student_id: 's-1', description: 'Leaky faucet', status: 'open', created_at: '2026-07-01T00:00:00Z' },
]

describe('TicketList', () => {
  it('renders each ticket description', () => {
    render(<TicketList tickets={tickets} />)
    expect(screen.getByText('Leaky faucet')).toBeInTheDocument()
  })

  it('shows a Resolve button and calls onResolve when provided', () => {
    const onResolve = vi.fn()
    render(<TicketList tickets={tickets} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: /resolve/i }))
    expect(onResolve).toHaveBeenCalledWith('ticket-1')
  })

  it('does not show a Resolve button when onResolve is not provided', () => {
    render(<TicketList tickets={tickets} />)
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument()
  })
})
