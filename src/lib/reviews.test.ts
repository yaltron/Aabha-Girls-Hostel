import { describe, it, expect, vi } from 'vitest'

const mockReviews = [
  { id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.', display_order: 0, is_published: true },
]

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))
const deleteEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockReviews, error: null })) })),
      insert: insertMock,
      update: vi.fn(() => ({ eq: updateEqMock })),
      delete: vi.fn(() => ({ eq: deleteEqMock })),
    })),
  },
}))

describe('fetchReviews', () => {
  it('returns all reviews ordered by display_order', async () => {
    const { fetchReviews } = await import('./reviews')
    expect(await fetchReviews()).toEqual(mockReviews)
  })
})

describe('createReview', () => {
  it('inserts a review with the given fields', async () => {
    const { createReview } = await import('./reviews')
    await createReview({ authorName: 'Priya S.', quote: 'Felt like home.' })
    expect(insertMock).toHaveBeenCalledWith({ author_name: 'Priya S.', quote: 'Felt like home.' })
  })
})

describe('updateReview', () => {
  it('updates only the given fields', async () => {
    const { updateReview } = await import('./reviews')
    await updateReview('review-1', { isPublished: false })
    expect(updateEqMock).toHaveBeenCalledWith('id', 'review-1')
  })
})

describe('deleteReview', () => {
  it('deletes the given review', async () => {
    const { deleteReview } = await import('./reviews')
    await deleteReview('review-1')
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'review-1')
  })
})
