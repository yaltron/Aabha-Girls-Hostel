import { describe, it, expect, vi } from 'vitest'

const mockInvoicesRawData = [
  {
    id: 'invoice-1',
    student_id: 'student-1',
    billing_month: '2026-07-01',
    amount: 14000,
    due_date: '2026-07-08',
    status: 'unpaid',
    students: { profiles: { full_name: 'Anjali Adhikari' } },
  },
]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: mockInvoicesRawData, error: null })),
      })),
    })),
    rpc: rpcMock,
  },
}))

describe('fetchDuesInvoices', () => {
  it('returns unpaid invoices with the student name flattened in', async () => {
    const { fetchDuesInvoices } = await import('./fees')
    const invoices = await fetchDuesInvoices()
    expect(invoices).toEqual([
      {
        id: 'invoice-1',
        student_id: 'student-1',
        student_name: 'Anjali Adhikari',
        billing_month: '2026-07-01',
        amount: 14000,
        due_date: '2026-07-08',
        status: 'unpaid',
      },
    ])
  })
})

describe('generateMonthlyInvoices', () => {
  it('calls the generate_monthly_invoices RPC with the billing month', async () => {
    const { generateMonthlyInvoices } = await import('./fees')
    await generateMonthlyInvoices('2026-07-01')
    expect(rpcMock).toHaveBeenCalledWith('generate_monthly_invoices', { p_billing_month: '2026-07-01' })
  })
})

describe('recordPayment', () => {
  it('calls the record_payment RPC with the given fields', async () => {
    const { recordPayment } = await import('./fees')
    await recordPayment({ invoiceId: 'invoice-1', amount: 14000, method: 'cash' })
    expect(rpcMock).toHaveBeenCalledWith('record_payment', {
      p_invoice_id: 'invoice-1',
      p_amount: 14000,
      p_method: 'cash',
      p_reference: null,
    })
  })
})
