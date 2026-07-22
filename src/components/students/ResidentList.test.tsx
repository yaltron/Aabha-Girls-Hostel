import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResidentList } from './ResidentList'
import type { Student } from '../../lib/students'

const unlinkedStudent: Student = {
  id: 's-1',
  full_name: 'Anjali Adhikari',
  photo_url: null,
  guardian_name: 'G. Adhikari',
  guardian_phone: '9800000001',
  bed_id: 'bed-1',
  check_in_date: '2026-07-01',
  monthly_fee: 14000,
  guardian_id: null,
}

const linkedStudent: Student = { ...unlinkedStudent, id: 's-2', full_name: 'Sita Nepali', guardian_id: 'guardian-1' }

describe('ResidentList', () => {
  it('renders each resident name and guardian phone', () => {
    render(<ResidentList students={[unlinkedStudent]} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
  })

  it('shows a Link Guardian button for a student with no linked guardian, and calls the handler on click', () => {
    const onLinkGuardian = vi.fn()
    render(<ResidentList students={[unlinkedStudent]} onLinkGuardian={onLinkGuardian} />)
    fireEvent.click(screen.getByRole('button', { name: /link guardian/i }))
    expect(onLinkGuardian).toHaveBeenCalledWith(unlinkedStudent)
  })

  it('shows a Post Update button (not Link Guardian) for a student with a linked guardian', () => {
    const onPostUpdate = vi.fn()
    render(<ResidentList students={[linkedStudent]} onLinkGuardian={vi.fn()} onPostUpdate={onPostUpdate} />)
    expect(screen.queryByRole('button', { name: /link guardian/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /post update/i }))
    expect(onPostUpdate).toHaveBeenCalledWith(linkedStudent)
  })
})
