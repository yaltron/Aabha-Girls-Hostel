import { useState } from 'react'
import { confirmTransfer, type TransferRequest } from '../../lib/transfers'

export function TransferStatusCard({
  request,
  onConfirmed,
}: {
  request: TransferRequest
  onConfirmed: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    setError(null)
    try {
      await confirmTransfer(request.id)
      onConfirmed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Confirmation failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
      <h3 className="font-display text-lg text-on-surface">Transfer Request</h3>
      {request.status === 'pending' && (
        <p className="text-on-surface-variant">Your transfer request is pending review.</p>
      )}
      {request.status === 'awaiting_confirmation' && (
        <div className="space-y-4">
          <p className="text-on-surface-variant">
            Your request was approved. The new room's price differs by{' '}
            <span className="font-medium text-on-surface">{request.price_diff}</span>. Confirm to complete the transfer.
          </p>
          {error && <p className="text-error text-sm">{error}</p>}
          <button
            onClick={handleConfirm}
            className="bg-primary text-on-primary px-8 py-4 rounded-full font-medium active:scale-95 transition-transform"
          >
            Confirm
          </button>
        </div>
      )}
      {request.status === 'rejected' && (
        <p className="text-on-surface-variant">
          Your request was declined: <span className="text-error">{request.reject_reason}</span>
        </p>
      )}
    </div>
  )
}
