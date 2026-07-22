import { useState, type FormEvent } from 'react'
import { recordPayment, type PaymentMethod } from '../../lib/fees'

export function RecordPaymentForm({
  invoiceId,
  defaultAmount,
  onRecorded,
}: {
  invoiceId: string
  defaultAmount: number
  onRecorded: () => void
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await recordPayment({
        invoiceId,
        amount: defaultAmount,
        method,
        reference: reference || undefined,
      })
      onRecorded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="method" className="block text-sm font-medium text-on-surface-variant">Method</label>
        <select
          id="method"
          value={method}
          onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          <option value="cash">Cash</option>
          <option value="esewa">eSewa</option>
          <option value="khalti">Khalti</option>
          <option value="fonepay">FonePay</option>
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="reference" className="block text-sm font-medium text-on-surface-variant">Reference (optional)</label>
        <input
          id="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Record Payment
      </button>
    </form>
  )
}
