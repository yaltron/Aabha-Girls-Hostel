import type { TransferRequestWithStudent } from '../../lib/transfers'

export function PendingTransferRequestsList({ requests }: { requests: TransferRequestWithStudent[] }) {
  if (requests.length === 0) {
    return <p className="text-on-surface-variant text-sm">No pending transfer requests.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Student</th>
            <th className="px-8 py-4">Reason</th>
            <th className="px-8 py-4">Preferred Type</th>
            <th className="px-8 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{request.student_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{request.reason}</td>
              <td className="px-8 py-5 text-on-surface-variant">{request.preferred_room_type}</td>
              <td className="px-8 py-5">
                <a href="/requests" className="text-primary font-medium hover:underline">
                  Review
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
