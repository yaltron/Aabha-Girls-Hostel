import { useState, type FormEvent } from 'react'
import { createReview, deleteReview, type Review } from '../../lib/reviews'

export function ReviewsManager({ reviews, onChanged }: { reviews: Review[]; onChanged: () => void }) {
  const [authorName, setAuthorName] = useState('')
  const [quote, setQuote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createReview({ authorName, quote })
      setAuthorName('')
      setQuote('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add review')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteReview(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete review')
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {reviews.map((review) => (
          <div key={review.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex justify-between items-start gap-4">
            <div>
              <p className="text-on-surface">{review.quote}</p>
              <p className="text-on-surface-variant text-sm mt-1">- {review.author_name}</p>
            </div>
            <button onClick={() => handleDelete(review.id)} className="text-error text-sm font-medium hover:underline flex-shrink-0">
              Delete
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <div className="space-y-2">
          <label htmlFor="reviewAuthor" className="block text-sm font-medium text-on-surface-variant">Author</label>
          <input id="reviewAuthor" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
        </div>
        <div className="space-y-2">
          <label htmlFor="reviewQuote" className="block text-sm font-medium text-on-surface-variant">Quote</label>
          <textarea id="reviewQuote" value={quote} onChange={(e) => setQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
        </div>
        {error && <p className="text-error text-sm">{error}</p>}
        <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
          Add Review
        </button>
      </form>
    </div>
  )
}
