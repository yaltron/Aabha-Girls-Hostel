import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostUpdateForm } from './PostUpdateForm'

const postGuardianUpdate = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/guardian', () => ({
  postGuardianUpdate: (...args: unknown[]) => postGuardianUpdate(...args),
}))

describe('PostUpdateForm', () => {
  it('prefills the message field with initialMessage', () => {
    render(<PostUpdateForm studentId="student-1" initialMessage="Already posted this month" onPosted={vi.fn()} />)
    expect(screen.getByLabelText(/this month's update/i)).toHaveValue('Already posted this month')
  })

  it('calls postGuardianUpdate with the student id and edited message on submit', async () => {
    const onPosted = vi.fn()
    render(<PostUpdateForm studentId="student-1" initialMessage="" onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/this month's update/i), { target: { value: 'All well!' } })
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))

    await waitFor(() => expect(postGuardianUpdate).toHaveBeenCalledWith('student-1', 'All well!'))
    expect(onPosted).toHaveBeenCalled()
  })

  it('shows an error and does not call onPosted when postGuardianUpdate rejects', async () => {
    postGuardianUpdate.mockRejectedValueOnce(new Error('Post failed'))
    const onPosted = vi.fn()
    render(<PostUpdateForm studentId="student-1" initialMessage="" onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/this month's update/i), { target: { value: 'All well!' } })
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))

    await waitFor(() => expect(screen.getByText('Post failed')).toBeInTheDocument())
    expect(onPosted).not.toHaveBeenCalled()
  })
})
