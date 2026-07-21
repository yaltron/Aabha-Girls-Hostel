import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('shows Financial Settings for owner but not warden', () => {
    const { rerender } = render(<Sidebar role="owner" />)
    expect(screen.getByText('Financial Settings')).toBeInTheDocument()

    rerender(<Sidebar role="warden" />)
    expect(screen.queryByText('Financial Settings')).not.toBeInTheDocument()
  })

  it('always shows Dashboard', () => {
    render(<Sidebar role="student" />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
