import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { InquiriesInbox } from './InquiriesInbox'
import type { Inquiry } from '../../lib/inquiries'

const updateInquiryStatus = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/inquiries', () => ({
  updateInquiryStatus: (...args: unknown[]) => updateInquiryStatus(...args),
}))

const inquiries: Inquiry[] = [
  { id: 'inq-1', name: 'Anita', phone: '9800000002', message: 'Any singles?', status: 'new', created_at: '2026-07-01T00:00:00Z' },
]

describe('InquiriesInbox', () => {
  it('renders inquiries and updates status on selection', async () => {
    const onChanged = vi.fn()
    render(<InquiriesInbox inquiries={inquiries} onChanged={onChanged} />)

    expect(screen.getByText('Anita')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/status for anita/i), { target: { value: 'contacted' } })

    await waitFor(() => expect(updateInquiryStatus).toHaveBeenCalledWith('inq-1', 'contacted'))
    expect(onChanged).toHaveBeenCalled()
  })

  it('shows an error and does not call onChanged when updateInquiryStatus rejects', async () => {
    updateInquiryStatus.mockRejectedValueOnce(new Error('Update failed'))
    const onChanged = vi.fn()
    render(<InquiriesInbox inquiries={inquiries} onChanged={onChanged} />)

    fireEvent.change(screen.getByLabelText(/status for anita/i), { target: { value: 'contacted' } })

    await waitFor(() => expect(screen.getByText('Update failed')).toBeInTheDocument())
    expect(onChanged).not.toHaveBeenCalled()
  })
})
