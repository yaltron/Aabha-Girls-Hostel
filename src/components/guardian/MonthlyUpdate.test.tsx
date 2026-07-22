import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthlyUpdate } from './MonthlyUpdate'
import type { GuardianUpdate } from '../../lib/guardian'

const update: GuardianUpdate = {
  id: 'update-1',
  student_id: 'student-1',
  month: '2026-07-01',
  message: 'Doing great this month!',
  created_at: '2026-07-05T00:00:00Z',
}

describe('MonthlyUpdate', () => {
  it('renders the message when an update exists', () => {
    render(<MonthlyUpdate update={update} />)
    expect(screen.getByText('Doing great this month!')).toBeInTheDocument()
  })

  it('shows a placeholder when no update has been posted yet', () => {
    render(<MonthlyUpdate update={null} />)
    expect(screen.getByText(/no update posted yet/i)).toBeInTheDocument()
  })
})
