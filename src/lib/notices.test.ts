import { describe, it, expect, vi } from 'vitest'

const mockNotices = [
  { id: 'notice-1', title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardian_visible: true, created_at: '2026-07-01T00:00:00Z' },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockNotices, error: null })),
      })),
      insert: insertMock,
    })),
  },
}))

describe('fetchNotices', () => {
  it('returns notices newest first', async () => {
    const { fetchNotices } = await import('./notices')
    const notices = await fetchNotices()
    expect(notices).toEqual(mockNotices)
  })
})

describe('postNotice', () => {
  it('inserts a notice with the given fields', async () => {
    const { postNotice } = await import('./notices')
    await postNotice({ title: 'Winter Break Schedule', body: 'Hostel closes Dec 20.', guardianVisible: true })
    expect(insertMock).toHaveBeenCalledWith({
      title: 'Winter Break Schedule',
      body: 'Hostel closes Dec 20.',
      guardian_visible: true,
    })
  })
})
