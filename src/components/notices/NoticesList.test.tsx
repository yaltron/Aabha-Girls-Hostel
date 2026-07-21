import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NoticesList } from './NoticesList'
import type { Notice } from '../../lib/notices'

const notices: Notice[] = [
  { id: 'notice-1', title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardian_visible: true, created_at: '2026-07-01T00:00:00Z' },
]

describe('NoticesList', () => {
  it('renders each notice title and body', () => {
    render(<NoticesList notices={notices} />)
    expect(screen.getByText('Winter Break Schedule')).toBeInTheDocument()
    expect(screen.getByText('Hostel closes Dec 20.')).toBeInTheDocument()
  })
})
