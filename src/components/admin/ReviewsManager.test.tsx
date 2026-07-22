import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewsManager } from './ReviewsManager'
import type { Review } from '../../lib/reviews'

const createReview = vi.fn().mockResolvedValue(undefined)
const deleteReview = vi.fn().mockResolvedValue(undefined)
const updateReview = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/reviews', () => ({
  createReview: (...args: unknown[]) => createReview(...args),
  deleteReview: (...args: unknown[]) => deleteReview(...args),
  updateReview: (...args: unknown[]) => updateReview(...args),
}))

const reviews: Review[] = [
  { id: 'review-1', author_name: 'Priya S.', quote: 'Felt like home.', display_order: 0, is_published: true },
]

describe('ReviewsManager', () => {
  it('renders existing reviews and adds a new one', async () => {
    const onChanged = vi.fn()
    render(<ReviewsManager reviews={reviews} onChanged={onChanged} />)

    expect(screen.getByText('Felt like home.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/author/i), { target: { value: 'Sita N.' } })
    fireEvent.change(screen.getByLabelText(/quote/i), { target: { value: 'Great mess food.' } })
    fireEvent.click(screen.getByRole('button', { name: /add review/i }))

    await waitFor(() => expect(createReview).toHaveBeenCalledWith({ authorName: 'Sita N.', quote: 'Great mess food.' }))
    expect(onChanged).toHaveBeenCalled()
  })

  it('deletes a review on click', async () => {
    const onChanged = vi.fn()
    render(<ReviewsManager reviews={reviews} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteReview).toHaveBeenCalledWith('review-1'))
    expect(onChanged).toHaveBeenCalled()
  })
})
