import { describe, it, expect, vi } from 'vitest'

const mockAvailability = [{ room_type: 'twin', monthly_price: 12000, beds_available: 2 }]
const mockMenu = [{ day_of_week: 0, meal: 'breakfast', description: 'Poha' }]
const mockNotices = [{ id: 'notice-1', title: 'Holiday', body: 'Closed Dec 25', created_at: '2026-07-01T00:00:00Z' }]
const mockContent = [{ key: 'hero', value: { headline: 'Home away from home' } }]
const mockMedia = [{ id: 'media-1', category: 'highlight', url: 'https://x/a.jpg', caption: null }]
const mockReviews = [{ id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.' }]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const responses: Record<string, unknown> = {
        public_room_availability: mockAvailability,
        public_weekly_menu: mockMenu,
        public_notices: mockNotices,
        public_site_content: mockContent,
        public_site_media: mockMedia,
        public_reviews: mockReviews,
      }
      return {
        select: vi.fn(() => Promise.resolve({ data: responses[table], error: null })),
        insert: insertMock,
      }
    }),
  },
}))

describe('fetchPublicRoomAvailability', () => {
  it('returns availability rows', async () => {
    const { fetchPublicRoomAvailability } = await import('./publicSite')
    expect(await fetchPublicRoomAvailability()).toEqual(mockAvailability)
  })
})

describe('fetchPublicWeeklyMenu', () => {
  it('returns menu rows', async () => {
    const { fetchPublicWeeklyMenu } = await import('./publicSite')
    expect(await fetchPublicWeeklyMenu()).toEqual(mockMenu)
  })
})

describe('fetchPublicNotices', () => {
  it('returns notice rows', async () => {
    const { fetchPublicNotices } = await import('./publicSite')
    expect(await fetchPublicNotices()).toEqual(mockNotices)
  })
})

describe('fetchPublicSiteContent', () => {
  it('returns a key-to-value map', async () => {
    const { fetchPublicSiteContent } = await import('./publicSite')
    expect(await fetchPublicSiteContent()).toEqual({ hero: { headline: 'Home away from home' } })
  })
})

describe('fetchPublicMedia', () => {
  it('returns media rows', async () => {
    const { fetchPublicMedia } = await import('./publicSite')
    expect(await fetchPublicMedia()).toEqual(mockMedia)
  })
})

describe('fetchPublicReviews', () => {
  it('returns review rows', async () => {
    const { fetchPublicReviews } = await import('./publicSite')
    expect(await fetchPublicReviews()).toEqual(mockReviews)
  })
})

describe('submitInquiry', () => {
  it('inserts an inquiry with the given fields', async () => {
    const { submitInquiry } = await import('./publicSite')
    await submitInquiry({ name: 'Anita', phone: '9800000002', message: 'Any singles?' })
    expect(insertMock).toHaveBeenCalledWith({ name: 'Anita', phone: '9800000002', message: 'Any singles?' })
  })
})

describe('submitBooking', () => {
  it('inserts a booking with the given fields', async () => {
    const { submitBooking } = await import('./publicSite')
    await submitBooking({ name: 'Sita', phone: '9800000003', guardianPhone: '9800000004', roomType: 'twin', preferredDate: '2026-08-01' })
    expect(insertMock).toHaveBeenCalledWith({
      name: 'Sita',
      phone: '9800000003',
      guardian_phone: '9800000004',
      room_type: 'twin',
      preferred_date: '2026-08-01',
    })
  })
})
