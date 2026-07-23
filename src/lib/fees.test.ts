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

const mockFeeHeadsData = [{ id: 'fh-1', name: 'Rent', is_recurring: true }]

const rpcMock = vi.fn(() => Promise.resolve({ error: null }))

const fromMock = vi.fn((table: string) => {
  if (table === 'invoices') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: mockInvoicesRawData, error: null })),
      })),
    }
  }
  if (table === 'fee_heads') {
    return {
      select: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockFeeHeadsData, error: null })) })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    }
  }
  throw new Error(`unexpected table: ${table}`)
})

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => fromMock(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
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

describe('fetchFeeHeads', () => {
  it('returns all fee heads', async () => {
    const { fetchFeeHeads } = await import('./fees')
    const feeHeads = await fetchFeeHeads()
    expect(feeHeads).toEqual(mockFeeHeadsData)
  })
})

describe('createFeeHead', () => {
  it('inserts a fee head with the given name and recurring flag', async () => {
    const { createFeeHead } = await import('./fees')
    await createFeeHead('Mess Charge', false)
    expect(fromMock).toHaveBeenCalledWith('fee_heads')
  })
})

describe('addInvoiceItem', () => {
  it('calls the add_invoice_item RPC with the given fields', async () => {
    const { addInvoiceItem } = await import('./fees')
    await addInvoiceItem('invoice-1', 'fh-1', 500, 'Extra mess charge')
    expect(rpcMock).toHaveBeenCalledWith('add_invoice_item', {
      p_invoice_id: 'invoice-1',
      p_fee_head_id: 'fh-1',
      p_amount: 500,
      p_description: 'Extra mess charge',
    })
  })

  it('sends null description when omitted', async () => {
    const { addInvoiceItem } = await import('./fees')
    await addInvoiceItem('invoice-1', 'fh-1', 500)
    expect(rpcMock).toHaveBeenCalledWith('add_invoice_item', {
      p_invoice_id: 'invoice-1',
      p_fee_head_id: 'fh-1',
      p_amount: 500,
      p_description: null,
    })
  })
})
