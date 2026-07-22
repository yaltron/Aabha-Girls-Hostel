import { updateInquiryStatus, type Inquiry, type InquiryStatus } from '../../lib/inquiries'

export function InquiriesInbox({ inquiries, onChanged }: { inquiries: Inquiry[]; onChanged: () => void }) {
  async function handleStatusChange(id: string, status: InquiryStatus) {
    await updateInquiryStatus(id, status)
    onChanged()
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Phone</th>
            <th className="px-8 py-4">Message</th>
            <th className="px-8 py-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {inquiries.map((inquiry) => (
            <tr key={inquiry.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{inquiry.name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{inquiry.phone}</td>
              <td className="px-8 py-5 text-on-surface-variant">{inquiry.message}</td>
              <td className="px-8 py-5">
                <select
                  aria-label={`Status for ${inquiry.name}`}
                  value={inquiry.status}
                  onChange={(e) => handleStatusChange(inquiry.id, e.target.value as InquiryStatus)}
                  className="bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="closed">Closed</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
