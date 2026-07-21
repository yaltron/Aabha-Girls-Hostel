import type { Ticket, TicketWithStudent } from '../../lib/maintenance'

export function TicketList({
  tickets,
  onResolve,
}: {
  tickets: Array<Ticket | TicketWithStudent>
  onResolve?: (ticketId: string) => void
}) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            {'student_name' in (tickets[0] ?? {}) && <th className="px-8 py-4">Student</th>}
            <th className="px-8 py-4">Description</th>
            <th className="px-8 py-4">Status</th>
            {onResolve && <th className="px-8 py-4">Action</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              {'student_name' in ticket && <td className="px-8 py-5 text-on-surface-variant">{ticket.student_name}</td>}
              <td className="px-8 py-5 font-medium text-on-surface">{ticket.description}</td>
              <td className="px-8 py-5 text-on-surface-variant">{ticket.status}</td>
              {onResolve && (
                <td className="px-8 py-5">
                  <button onClick={() => onResolve(ticket.id)} className="text-primary font-medium hover:underline">
                    Resolve
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
