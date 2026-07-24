import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DefaulterList } from './DefaulterList'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali', billing_month: '2026-06-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
  { id: 'inv-2', student_id: 's-2', student_name: 'Sita', billing_month: '2026-07-01', amount: 14000, due_date: '2099-01-01', status: 'unpaid' },
  { id: 'inv-3', student_id: 's-3', student_name: 'Gita', billing_month: '2026-05-01', amount: 14000, due_date: '2020-01-01', status: 'paid' },
]

describe('DefaulterList', () => {
  it('shows only overdue, unpaid invoices', () => {
    render(<DefaulterList invoices={invoices} />)
    expect(screen.getByText('Anjali')).toBeInTheDocument()
    expect(screen.queryByText('Sita')).not.toBeInTheDocument()
    expect(screen.queryByText('Gita')).not.toBeInTheDocument()
  })

  it('shows an empty message when there are no overdue invoices', () => {
    render(<DefaulterList invoices={[invoices[1]]} />)
    expect(screen.getByText(/no overdue invoices/i)).toBeInTheDocument()
  })
})
