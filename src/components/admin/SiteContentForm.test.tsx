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
  trust_stats: [
    { label: '10+ Years of Excellence', sublabel: '' },
    { label: '2 Mins from Global College', sublabel: '' },
    { label: '24/7 CCTV & Security', sublabel: '' },
    { label: 'Trusted by 500+ Families', sublabel: '' },
  ],
  trust_points: [
    { title: 'Healthy Meals', description: 'Hygienic, home-style meals.' },
    { title: 'Safe Environment', description: 'Gated community, biometric access.' },
    { title: 'Female Warden', description: '24/7 on-site female warden.' },
    { title: 'Prime Location', description: 'Steps from top colleges.' },
  ],
  rooms_hero: { headline: 'Comfortable Spaces for Focused Learning', subhead: '' },
  transparency_intro: { headline: 'Transparency is Our Commitment', text: 'We believe in radical honesty.' },
  safety_protocol: [
    { title: '24/7 CCTV Monitoring', description: 'Full coverage of common areas.' },
    { title: 'Fire Safety First', description: 'Extinguishers on every floor.' },
    { title: 'Strict Curfew Policy', description: 'Secure entry after 8:00 PM.' },
  ],
  team: {
    warden: { name: 'Mrs. Sunita Sharma', quote: 'My goal is to provide a safe environment.' },
    owner: { name: 'Ms. Aabha Shrestha', quote: 'Aabha was born from my own experience.' },
  },
  fee_schedule: [
    { component: 'Admission Fee', description: 'One-time registration', amount: 'Rs. 10,000' },
    { component: 'Monthly Rent', description: 'Varies by room type', amount: 'From Rs. 12,000' },
    { component: 'Food Charges', description: 'Includes 4 meals daily', amount: 'Rs. 8,500/mo' },
    { component: 'Refundable Deposit', description: 'Equivalent to one month rent', amount: '1 Month Rent' },
  ],
  contact: { phone: '+977 1-4XXXXXX', address: 'Mid-Baneshwor, Kathmandu' },
}

describe('SiteContentForm', () => {
  it('prefills every section from content and saves an edited hero headline', async () => {
    const onSaved = vi.fn()
    render(<SiteContentForm content={content} onSaved={onSaved} />)

    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('Home away from home')
    expect(screen.getByDisplayValue('Healthy Meals')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Mrs. Sunita Sharma')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Admission Fee')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/hero headline/i), { target: { value: 'New headline' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(updateSiteContent).toHaveBeenCalledWith('hero', { headline: 'New headline', subhead: 'Safe, comfortable living' }),
    )
    expect(updateSiteContent).toHaveBeenCalledWith('trust_stats', content.trust_stats)
    expect(updateSiteContent).toHaveBeenCalledWith('trust_points', content.trust_points)
    expect(updateSiteContent).toHaveBeenCalledWith('rooms_hero', content.rooms_hero)
    expect(updateSiteContent).toHaveBeenCalledWith('transparency_intro', content.transparency_intro)
    expect(updateSiteContent).toHaveBeenCalledWith('safety_protocol', content.safety_protocol)
    expect(updateSiteContent).toHaveBeenCalledWith('team', content.team)
    expect(updateSiteContent).toHaveBeenCalledWith('fee_schedule', content.fee_schedule)
    expect(updateSiteContent).toHaveBeenCalledWith('contact', content.contact)
    expect(onSaved).toHaveBeenCalled()
  })

  it('falls back to empty defaults when a key is missing entirely (first-ever save)', () => {
    render(<SiteContentForm content={{}} onSaved={vi.fn()} />)
    expect(screen.getByLabelText(/hero headline/i)).toHaveValue('')
    expect(screen.getAllByPlaceholderText(/stat label/i)).toHaveLength(4)
    expect(screen.getAllByPlaceholderText(/trust point title/i)).toHaveLength(4)
    expect(screen.getAllByPlaceholderText(/protocol title/i)).toHaveLength(3)
    expect(screen.getAllByPlaceholderText(/fee component/i)).toHaveLength(4)
  })
})
