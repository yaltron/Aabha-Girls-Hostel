import { describe, it, expect, vi } from 'vitest'

const mockRows = [
  { key: 'hero', value: { headline: 'Home away from home', subhead: 'Safe, comfortable hostel living' } },
  { key: 'about', value: { text: 'Aabha Girls Hostel has been...' } },
]

const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: mockRows, error: null })),
      upsert: upsertMock,
    })),
  },
}))

describe('fetchSiteContent', () => {
  it('returns a key-to-value map built from every row', async () => {
    const { fetchSiteContent } = await import('./siteContent')
    const content = await fetchSiteContent()
    expect(content).toEqual({
      hero: { headline: 'Home away from home', subhead: 'Safe, comfortable hostel living' },
      about: { text: 'Aabha Girls Hostel has been...' },
    })
  })
})

describe('updateSiteContent', () => {
  it('upserts the given key with the given value', async () => {
    const { updateSiteContent } = await import('./siteContent')
    await updateSiteContent('hero', { headline: 'New headline' })
    expect(upsertMock).toHaveBeenCalledWith({ key: 'hero', value: { headline: 'New headline' } })
  })
})
