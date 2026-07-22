import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SiteContentForm } from './SiteContentForm'

const updateSiteContent = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/siteContent', () => ({
  updateSiteContent: (...args: unknown[]) => updateSiteContent(...args),
}))

const content = {
  hero: { headline: 'Home away from home', subhead: 'Safe, comfortable living' },
  about: { text: 'Aabha Girls Hostel...' },
}

describe('SiteContentForm', () => {
  it('prefills fields from content and saves an edited hero headline', async () => {
    const onSaved = vi.fn()
    render(<SiteContentForm content={content} onSaved={onSaved} />)

    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('Home away from home')

    fireEvent.change(screen.getByLabelText(/hero headline/i), { target: { value: 'New headline' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(updateSiteContent).toHaveBeenCalledWith('hero', { headline: 'New headline', subhead: 'Safe, comfortable living' }),
    )
    expect(onSaved).toHaveBeenCalled()
  })
})
