import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type ReceiptData = {
  receiptNo: number
  studentName: string
  billingMonth: string
  amount: number
  method: string
  reference: string | null
  paidAt: string
}

async function fetchReceipt(invoiceId: string): Promise<ReceiptData | null> {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('billing_month, amount, students(profiles!students_id_fkey(full_name))')
    .eq('id', invoiceId)
    .single()
  if (invoiceError) throw invoiceError

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('receipt_no, method, reference, paid_at')
    .eq('invoice_id', invoiceId)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (paymentError) throw paymentError
  if (!payment) return null

  const row = invoice as any
  return {
    receiptNo: payment.receipt_no,
    studentName: row.students?.profiles?.full_name ?? '',
    billingMonth: row.billing_month,
    amount: row.amount,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paid_at,
  }
}

function ReceiptPage() {
  const { invoiceId } = Route.useParams()
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)

  useEffect(() => {
    fetchReceipt(invoiceId).then(setReceipt)
  }, [invoiceId])

  if (!receipt) return null

  return (
    <div className="max-w-lg mx-auto bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <h2 className="font-display text-2xl text-primary">Payment Receipt</h2>
      <div className="space-y-2 text-on-surface">
        <p><span className="text-on-surface-variant">Receipt No:</span> {receipt.receiptNo}</p>
        <p><span className="text-on-surface-variant">Student:</span> {receipt.studentName}</p>
        <p><span className="text-on-surface-variant">Billing Month:</span> {receipt.billingMonth}</p>
        <p><span className="text-on-surface-variant">Amount:</span> {receipt.amount}</p>
        <p><span className="text-on-surface-variant">Method:</span> {receipt.method}</p>
        {receipt.reference && <p><span className="text-on-surface-variant">Reference:</span> {receipt.reference}</p>}
        <p><span className="text-on-surface-variant">Paid At:</span> {receipt.paidAt}</p>
      </div>
      <button
        onClick={() => window.print()}
        className="print:hidden bg-primary text-on-primary py-4 px-8 rounded-full font-medium active:scale-95 transition-transform"
      >
        Print / Download
      </button>
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/receipt/$invoiceId')({
  component: ReceiptPage,
})
