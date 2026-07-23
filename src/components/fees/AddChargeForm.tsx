import { useState, type FormEvent } from 'react'
import { addInvoiceItem, type FeeHead } from '../../lib/fees'

export function AddChargeForm({ invoiceId, feeHeads, onAdded }: { invoiceId: string; feeHeads: FeeHead[]; onAdded: () => void }) {
  const [feeHeadId, setFeeHeadId] = useState(feeHeads[0]?.id ?? '')
  const [amount, setAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await addInvoiceItem(invoiceId, feeHeadId, amount, description || undefined)
      onAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add charge')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="chargeFeeHead" className="block text-sm font-medium text-on-surface-variant">Fee Head</label>
        <select id="chargeFeeHead" value={feeHeadId} onChange={(e) => setFeeHeadId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required>
          {feeHeads.map((fh) => (
            <option key={fh.id} value={fh.id}>{fh.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="chargeAmount" className="block text-sm font-medium text-on-surface-variant">Amount</label>
        <input id="chargeAmount" type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="chargeDescription" className="block text-sm font-medium text-on-surface-variant">Description (optional)</label>
        <input id="chargeDescription" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Add Charge
      </button>
    </form>
  )
}
