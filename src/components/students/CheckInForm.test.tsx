import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CheckInForm } from './CheckInForm'
import type { Bed } from '../../lib/rooms'

const checkInStudent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/students', () => ({
  checkInStudent: (...args: unknown[]) => checkInStudent(...args),
}))

const vacantBeds: Bed[] = [{ id: 'bed-1', room_id: 'room-1', bed_label: 'A', status: 'vacant' }]

describe('CheckInForm', () => {
  it('calls checkInStudent with the entered fields on submit', async () => {
    const onCheckedIn = vi.fn()
    render(<CheckInForm vacantBeds={vacantBeds} onCheckedIn={onCheckedIn} profileId="profile-1" />)

    fireEvent.change(screen.getByLabelText(/guardian name/i), { target: { value: 'G. Adhikari' } })
    fireEvent.change(screen.getByLabelText(/guardian phone/i), { target: { value: '9800000001' } })
    fireEvent.change(screen.getByLabelText(/check-in date/i), { target: { value: '2026-07-01' } })
    fireEvent.change(screen.getByLabelText(/monthly fee/i), { target: { value: '14000' } })
    fireEvent.change(screen.getByLabelText(/bed/i), { target: { value: 'bed-1' } })
    fireEvent.click(screen.getByRole('button', { name: /check in/i }))

    await waitFor(() => expect(checkInStudent).toHaveBeenCalled())
    expect(onCheckedIn).toHaveBeenCalled()
  })
})
