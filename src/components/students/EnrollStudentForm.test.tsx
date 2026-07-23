import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnrollStudentForm } from './EnrollStudentForm'

const enrollStudent = vi.fn()

vi.mock('../../lib/students', () => ({
  enrollStudent: (...args: unknown[]) => enrollStudent(...args),
}))

describe('EnrollStudentForm', () => {
  it('calls enrollStudent with the entered name and phone, shows the returned password, and calls onEnrolled', async () => {
    enrollStudent.mockResolvedValueOnce({ profileId: 'new-profile-1', password: 'Ab3xY9kLmP2q' })
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Sharma' } })
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9800000005' } })
    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(enrollStudent).toHaveBeenCalledWith('Priya Sharma', '9800000005'))
    expect(screen.getByText('Ab3xY9kLmP2q')).toBeInTheDocument()
    expect(onEnrolled).toHaveBeenCalledWith('new-profile-1')
  })

  it('shows an error and does not call onEnrolled when enrollStudent rejects', async () => {
    enrollStudent.mockRejectedValueOnce(new Error('A student with this phone number is already enrolled'))
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(screen.getByText('A student with this phone number is already enrolled')).toBeInTheDocument())
    expect(onEnrolled).not.toHaveBeenCalled()
  })
})
