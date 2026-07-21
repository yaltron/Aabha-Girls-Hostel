import { useState, type FormEvent } from 'react'
import { submitTransferRequest, type TransferRequest } from '../../lib/transfers'

export function TransferRequestForm({
  fromBedId,
  onSubmitted,
}: {
  fromBedId: string
  onSubmitted: () => void
}) {
  const [reason, setReason] = useState('')
  const [preferredRoomType, setPreferredRoomType] = useState<TransferRequest['preferred_room_type']>('single')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await submitTransferRequest({ fromBedId, reason, preferredRoomType })
      onSubmitted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="reason" className="block text-sm font-medium text-on-surface-variant">Reason</label>
        <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="preferredRoomType" className="block text-sm font-medium text-on-surface-variant">Preferred Room Type</label>
        <select
          id="preferredRoomType"
          value={preferredRoomType}
          onChange={(e) => setPreferredRoomType(e.target.value as TransferRequest['preferred_room_type'])}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          <option value="single">Single</option>
          <option value="twin">Twin</option>
          <option value="triple">Triple</option>
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Submit Request
      </button>
    </form>
  )
}
