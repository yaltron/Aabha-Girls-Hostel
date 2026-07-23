import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchDuesInvoices, generateMonthlyInvoices, fetchFeeHeads, type Invoice, type FeeHead } from '../lib/fees'
import { useAuth } from '../lib/auth'
import { DuesTable } from '../components/fees/DuesTable'
import { RecordPaymentForm } from '../components/fees/RecordPaymentForm'
import { FeeHeadForm } from '../components/fees/FeeHeadForm'
import { AddChargeForm } from '../components/fees/AddChargeForm'

function currentBillingMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

function FeesPage() {
  const { role } = useAuth()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [lastPaidInvoiceId, setLastPaidInvoiceId] = useState<string | null>(null)
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([])
  const [chargingInvoice, setChargingInvoice] = useState<Invoice | null>(null)
  const [addingFeeHead, setAddingFeeHead] = useState(false)
  const canManage = role === 'owner'

  function refetch() {
    fetchDuesInvoices().then(setInvoices)
    fetchFeeHeads().then(setFeeHeads)
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

  function handleChargeAdded() {
    setChargingInvoice(null)
    refetch()
  }

  function handleFeeHeadSaved() {
    setAddingFeeHead(false)
    refetch()
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl text-on-surface">Fees</h2>
        <div className="flex gap-4">
          {canManage && (
            <button
              onClick={() => setAddingFeeHead(true)}
              className="text-primary font-medium hover:underline"
            >
              Add Fee Head
            </button>
          )}
          <button
            onClick={handleGenerate}
            className="bg-primary text-on-primary px-6 py-3 rounded-full font-medium active:scale-95 transition-transform"
          >
            Generate This Month's Invoices
          </button>
        </div>
      </div>

      {addingFeeHead && <FeeHeadForm onSaved={handleFeeHeadSaved} />}

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

      <DuesTable invoices={invoices} onSelectInvoice={setSelectedInvoice} onAddCharge={setChargingInvoice} />

      {selectedInvoice && (
        <RecordPaymentForm
          invoiceId={selectedInvoice.id}
          defaultAmount={selectedInvoice.amount}
          onRecorded={handleRecorded}
        />
      )}

      {chargingInvoice && (
        <AddChargeForm invoiceId={chargingInvoice.id} feeHeads={feeHeads} onAdded={handleChargeAdded} />
      )}
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/fees')({
  component: FeesPage,
})
