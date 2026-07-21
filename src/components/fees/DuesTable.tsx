import type { Invoice } from '../../lib/fees'
import { isOverdue } from '../../lib/dues'

export function DuesTable({
  invoices,
  onSelectInvoice,
}: {
  invoices: Invoice[]
  onSelectInvoice: (invoice: Invoice) => void
}) {
  const today = new Date()

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Amount</th>
            <th className="px-8 py-4">Due Date</th>
            <th className="px-8 py-4">Status</th>
            <th className="px-8 py-4">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{invoice.student_name}</td>
              <td className="px-8 py-5 text-on-surface">{invoice.amount}</td>
              <td className="px-8 py-5 text-on-surface-variant">{invoice.due_date}</td>
              <td className="px-8 py-5">
                {isOverdue(invoice, today) && (
                  <span className="bg-error-container text-on-error-container text-xs px-3 py-1 rounded-full uppercase">
                    Overdue
                  </span>
                )}
              </td>
              <td className="px-8 py-5">
                <button
                  onClick={() => onSelectInvoice(invoice)}
                  className="text-primary font-medium hover:underline"
                >
                  Record Payment
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
