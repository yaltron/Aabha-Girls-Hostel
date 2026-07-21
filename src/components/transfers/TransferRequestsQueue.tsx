import { useState } from 'react'
import { approveTransferRequest, rejectTransferRequest, type TransferRequestWithStudent } from '../../lib/transfers'
import type { Bed } from '../../lib/rooms'

function RequestRow({
  request,
  vacantBeds,
  onDecided,
}: {
  request: TransferRequestWithStudent
  vacantBeds: Bed[]
  onDecided: () => void
}) {
  const [selectedBedId, setSelectedBedId] = useState(vacantBeds[0]?.id ?? '')
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleApprove() {
    setError(null)
    try {
      await approveTransferRequest(request.id, selectedBedId)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed')
    }
  }

  async function handleReject() {
    setError(null)
    try {
      await rejectTransferRequest(request.id, rejectReason)
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed')
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-4">
      <div>
        <p className="font-medium text-on-surface">{request.student_name}</p>
        <p className="text-on-surface-variant text-sm">{request.reason}</p>
        <p className="text-xs uppercase tracking-wider text-secondary mt-1">Preferred: {request.preferred_room_type}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={`bed-${request.id}`} className="block text-sm font-medium text-on-surface-variant">Assign Bed</label>
        <select
          id={`bed-${request.id}`}
          value={selectedBedId}
          onChange={(e) => setSelectedBedId(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          {vacantBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor={`reject-${request.id}`} className="block text-sm font-medium text-on-surface-variant">Reject Reason</label>
        <input
          id={`reject-${request.id}`}
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="flex gap-3">
        <button onClick={handleApprove} className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Approve
        </button>
        <button onClick={handleReject} className="border border-error text-error px-6 py-3 rounded-full font-medium active:scale-95 transition-transform">
          Reject
        </button>
      </div>
    </div>
  )
}

export function TransferRequestsQueue({
  requests,
  vacantBedsByType,
  onDecided,
}: {
  requests: TransferRequestWithStudent[]
  vacantBedsByType: (roomType: TransferRequestWithStudent['preferred_room_type']) => Bed[]
  onDecided: () => void
}) {
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          request={request}
          vacantBeds={vacantBedsByType(request.preferred_room_type)}
          onDecided={onDecided}
        />
      ))}
    </div>
  )
}
