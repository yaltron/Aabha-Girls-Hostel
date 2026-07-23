import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows Site Content for owner but not warden', () => {
    const { rerender } = render(<Sidebar role="owner" />)
    expect(screen.getByText('Site Content')).toBeInTheDocument()

    rerender(<Sidebar role="warden" />)
    expect(screen.queryByText('Site Content')).not.toBeInTheDocument()
  })

  it('always shows Dashboard', () => {
    render(<Sidebar role="student" />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
