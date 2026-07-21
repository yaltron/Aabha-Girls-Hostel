import { useState, type FormEvent } from 'react'
import { raiseTicket } from '../../lib/maintenance'

export function TicketForm({ onRaised }: { onRaised: () => void }) {
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await raiseTicket(description)
      setDescription('')
      onRaised()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not raise ticket')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-on-surface-variant">Description</label>
        <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Raise Ticket
      </button>
    </form>
  )
}
