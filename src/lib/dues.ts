import type { Invoice } from './fees'

export function isOverdue(invoice: Pick<Invoice, 'due_date' | 'status'>, today: Date): boolean {
  if (invoice.status !== 'unpaid') return false
  return new Date(invoice.due_date) < today
}

export function calculateFeesCollectedThisMonth(
  payments: Array<{ amount: number; paid_at: string }>,
  today: Date,
): number {
  return payments
    .filter((p) => {
      const paidAt = new Date(p.paid_at)
      return paidAt.getFullYear() === today.getFullYear() && paidAt.getMonth() === today.getMonth()
    })
    .reduce((sum, p) => sum + p.amount, 0)
}
