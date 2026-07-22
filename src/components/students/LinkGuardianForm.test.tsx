import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LinkGuardianForm } from './LinkGuardianForm'

const linkGuardian = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/students', () => ({
  linkGuardian: (...args: unknown[]) => linkGuardian(...args),
}))

const unlinkedGuardians = [
  { id: 'guardian-1', full_name: 'Ram Guardian' },
  { id: 'guardian-2', full_name: 'Sita Guardian' },
]

describe('LinkGuardianForm', () => {
  it('calls linkGuardian with the student id and selected guardian id on submit', async () => {
    const onLinked = vi.fn()
    render(<LinkGuardianForm studentId="student-1" unlinkedGuardians={unlinkedGuardians} onLinked={onLinked} />)

    fireEvent.change(screen.getByLabelText(/guardian account/i), { target: { value: 'guardian-2' } })
    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))

    await waitFor(() => expect(linkGuardian).toHaveBeenCalledWith('student-1', 'guardian-2'))
    expect(onLinked).toHaveBeenCalled()
  })

  it('shows an error and does not call onLinked when linkGuardian rejects', async () => {
    linkGuardian.mockRejectedValueOnce(new Error('Link failed'))
    const onLinked = vi.fn()
    render(<LinkGuardianForm studentId="student-1" unlinkedGuardians={unlinkedGuardians} onLinked={onLinked} />)

    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))

    await waitFor(() => expect(screen.getByText('Link failed')).toBeInTheDocument())
    expect(onLinked).not.toHaveBeenCalled()
  })
})
