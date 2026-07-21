import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DuesTable } from './DuesTable'
import type { Invoice } from '../../lib/fees'

const invoices: Invoice[] = [
  { id: 'inv-1', student_id: 's-1', student_name: 'Anjali Adhikari', billing_month: '2026-07-01', amount: 14000, due_date: '2020-01-01', status: 'unpaid' },
  { id: 'inv-2', student_id: 's-2', student_name: 'Sita Nepali', billing_month: '2026-07-01', amount: 12000, due_date: '2099-01-01', status: 'unpaid' },
]

describe('DuesTable', () => {
  it('renders every invoice with student name and amount', () => {
    render(<DuesTable invoices={invoices} onSelectInvoice={vi.fn()} />)
    expect(screen.getByText('Anjali Adhikari')).toBeInTheDocument()
    expect(screen.getByText('Sita Nepali')).toBeInTheDocument()
  })

  it('shows an overdue badge only for invoices past their due date', () => {
    render(<DuesTable invoices={invoices} onSelectInvoice={vi.fn()} />)
    const overdueBadges = screen.getAllByText('Overdue')
    expect(overdueBadges).toHaveLength(1)
  })

  it('calls onSelectInvoice with the clicked invoice', () => {
    const onSelectInvoice = vi.fn()
    render(<DuesTable invoices={invoices} onSelectInvoice={onSelectInvoice} />)
    fireEvent.click(screen.getAllByRole('button', { name: /record payment/i })[0])
    expect(onSelectInvoice).toHaveBeenCalledWith(invoices[0])
  })
})
