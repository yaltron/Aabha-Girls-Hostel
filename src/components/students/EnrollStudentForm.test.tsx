import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { EnrollStudentForm } from './EnrollStudentForm'

const enrollStudent = vi.fn()

vi.mock('../../lib/students', () => ({
  enrollStudent: (...args: unknown[]) => enrollStudent(...args),
}))

describe('EnrollStudentForm', () => {
  beforeEach(() => {
    enrollStudent.mockClear()
  })

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

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Sharma' } })
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9800000005' } })
    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(screen.getByText('A student with this phone number is already enrolled')).toBeInTheDocument())
    expect(onEnrolled).not.toHaveBeenCalled()
  })

  it('resets to a blank form when "Enroll another student" is clicked after a successful enrollment', async () => {
    enrollStudent.mockResolvedValueOnce({ profileId: 'new-profile-1', password: 'Ab3xY9kLmP2q' })
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Priya Sharma' } })
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '9800000005' } })
    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(screen.getByText('Ab3xY9kLmP2q')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /enroll another student/i }))

    expect(screen.queryByText('Ab3xY9kLmP2q')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/full name/i)).toHaveValue('')
    expect(screen.getByLabelText(/phone/i)).toHaveValue('')
  })

  it('shows a validation error and does not call enrollStudent when fields are left empty', async () => {
    const onEnrolled = vi.fn()
    render(<EnrollStudentForm onEnrolled={onEnrolled} />)

    fireEvent.click(screen.getByRole('button', { name: /enroll/i }))

    await waitFor(() => expect(screen.getByText('Full name and phone are required')).toBeInTheDocument())
    expect(enrollStudent).not.toHaveBeenCalled()
    expect(onEnrolled).not.toHaveBeenCalled()
  })
})
