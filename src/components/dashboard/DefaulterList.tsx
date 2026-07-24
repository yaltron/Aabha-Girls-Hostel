import type { Invoice } from '../../lib/fees'
import { isOverdue } from '../../lib/dues'

export function DefaulterList({ invoices }: { invoices: Invoice[] }) {
  const today = new Date()
  const defaulters = invoices.filter((invoice) => isOverdue(invoice, today))

  if (defaulters.length === 0) {
    return <p className="text-on-surface-variant text-sm">No overdue invoices.</p>
  }

  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Amount</th>
            <th className="px-8 py-4">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {defaulters.map((invoice) => (
            <tr key={invoice.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{invoice.student_name}</td>
              <td className="px-8 py-5 text-on-surface">{invoice.amount}</td>
              <td className="px-8 py-5 text-on-surface-variant">{invoice.due_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
