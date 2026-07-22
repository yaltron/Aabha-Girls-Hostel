import { useState, type FormEvent } from 'react'
import { postGuardianUpdate } from '../../lib/guardian'

export function PostUpdateForm({
  studentId,
  initialMessage,
  onPosted,
}: {
  studentId: string
  initialMessage: string
  onPosted: () => void
}) {
  const [message, setMessage] = useState(initialMessage)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await postGuardianUpdate(studentId, message)
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post update')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="updateMessage" className="block text-sm font-medium text-on-surface-variant">
          This Month's Update
        </label>
        <textarea
          id="updateMessage"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
          required
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Post Update
      </button>
    </form>
  )
}
