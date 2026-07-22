import { supabase } from './supabase'

export type InvoiceStatus = 'unpaid' | 'paid'
export type PaymentMethod = 'cash' | 'esewa' | 'khalti' | 'fonepay'

export type Invoice = {
  id: string
  student_id: string
  student_name: string
  billing_month: string
  amount: number
  due_date: string
  status: InvoiceStatus
}

export async function fetchDuesInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, students(profiles!students_id_fkey(full_name))')
    .eq('status', 'unpaid')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    student_id: row.student_id,
    student_name: row.students?.profiles?.full_name ?? '',
    billing_month: row.billing_month,
    amount: row.amount,
    due_date: row.due_date,
    status: row.status,
  }))
}

export async function generateMonthlyInvoices(billingMonth: string): Promise<void> {
  const { error } = await supabase.rpc('generate_monthly_invoices', { p_billing_month: billingMonth })
  if (error) throw error
}

export async function recordPayment(input: {
  invoiceId: string
  amount: number
  method: PaymentMethod
  reference?: string
}): Promise<void> {
  const { error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
  })
  if (error) throw error
}
