import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResidentList } from './ResidentList'
import type { Student } from '../../lib/students'

const students: Student[] = [
  { id: 's-1', full_name: 'Anjali Adhikari', photo_url: null, guardian_name: 'G. Adhikari', guardian_phone: '9800000001', bed_id: 'bed-1', check_in_date: '2026-07-01', monthly_fee: 14000 },
]

describe('ResidentList', () => {
  it('renders each resident name and guardian phone', () => {
    render(<ResidentList students={students} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('9800000001')).toBeInTheDocument()
  })
})
