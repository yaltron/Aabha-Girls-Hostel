import { describe, it, expect, vi } from 'vitest'

const mockInquiries = [
  { id: 'inq-1', name: 'Anita', phone: '9800000002', message: 'Any singles available?', status: 'new', created_at: '2026-07-01T00:00:00Z' },
]

const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: updateEqMock }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockInquiries, error: null })) })),
      update: updateMock,
    })),
  },
}))

describe('fetchInquiries', () => {
  it('returns all inquiries newest first', async () => {
    const { fetchInquiries } = await import('./inquiries')
    expect(await fetchInquiries()).toEqual(mockInquiries)
  })
})

describe('updateInquiryStatus', () => {
  it('updates the given inquiry to the given status', async () => {
    const { updateInquiryStatus } = await import('./inquiries')
    await updateInquiryStatus('inq-1', 'contacted')
    expect(updateMock).toHaveBeenCalledWith({ status: 'contacted' })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'inq-1')
  })
})
