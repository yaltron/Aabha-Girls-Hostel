import { useState, type FormEvent } from 'react'
import { createFeeHead } from '../../lib/fees'

export function FeeHeadForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState('')
  const [isRecurring, setIsRecurring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await createFeeHead(name, isRecurring)
      setName('')
      setIsRecurring(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save fee head')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="feeHeadName" className="block text-sm font-medium text-on-surface-variant">Name</label>
        <input id="feeHeadName" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <label className="flex items-center gap-2">
        <input id="feeHeadRecurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
        Recurring
      </label>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Add Fee Head
      </button>
    </form>
  )
}
