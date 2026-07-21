import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchDuesInvoices, generateMonthlyInvoices, type Invoice } from '../lib/fees'
import { DuesTable } from '../components/fees/DuesTable'
import { RecordPaymentForm } from '../components/fees/RecordPaymentForm'

function currentBillingMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function FeesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [lastPaidInvoiceId, setLastPaidInvoiceId] = useState<string | null>(null)

  function refetch() {
    fetchDuesInvoices().then(setInvoices)
  }

  useEffect(() => {
    refetch()
  }, [])

  async function handleGenerate() {
    await generateMonthlyInvoices(currentBillingMonth())
    refetch()
  }

  function handleRecorded() {
    setLastPaidInvoiceId(selectedInvoice?.id ?? null)
    setSelectedInvoice(null)
    refetch()
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl text-on-surface">Fees</h2>
        <button
          onClick={handleGenerate}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
        >
          Generate This Month's Invoices
        </button>
      </div>

      {lastPaidInvoiceId && (
        <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex justify-between items-center">
          <p className="text-on-surface">Payment recorded.</p>
          <div className="flex items-center gap-4">
            <Link
              to="/receipt/$invoiceId"
              params={{ invoiceId: lastPaidInvoiceId }}
              className="text-primary font-medium hover:underline"
            >
              View Receipt
            </Link>
            <button onClick={() => setLastPaidInvoiceId(null)} className="text-on-surface-variant text-sm hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <DuesTable invoices={invoices} onSelectInvoice={setSelectedInvoice} />

      {selectedInvoice && (
        <RecordPaymentForm
          invoiceId={selectedInvoice.id}
          defaultAmount={selectedInvoice.amount}
          onRecorded={handleRecorded}
        />
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/fees')({
  component: FeesPage,
})
