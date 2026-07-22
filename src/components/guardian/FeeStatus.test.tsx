import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeeStatus } from './FeeStatus'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2026-06-10', status: 'paid' },
  { id: 'inv-2', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-07-01', amount: 14000, due_date: '2099-01-01', status: 'unpaid' },
  { id: 'inv-3', student_id: 'student-1', student_name: 'Anjali', billing_month: '2026-05-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
]

describe('FeeStatus', () => {
  it('renders each invoice with its billing month, amount, and status - and no payment action', () => {
    render(<FeeStatus invoices={invoices} />)
    expect(screen.getByText('2026-06-01')).toBeInTheDocument()
    expect(screen.getByText('2026-07-01')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByText('Paid')).toBeInTheDocument()
    expect(screen.queryByText(/record payment/i)).not.toBeInTheDocument()
  })

  it('renders Unpaid badge for invoices with future due dates', () => {
    render(<FeeStatus invoices={invoices} />)
    const unpaidBadges = screen.getAllByText('Unpaid')
    expect(unpaidBadges.length).toBeGreaterThan(0)
    expect(unpaidBadges[0]).toBeInTheDocument()
  })

  it('renders Overdue badge for invoices with past due dates', () => {
    render(<FeeStatus invoices={invoices} />)
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })
})
