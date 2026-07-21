import { useState, type FormEvent } from 'react'
import { checkInStudent } from '../../lib/students'
import type { Bed } from '../../lib/rooms'

export function CheckInForm({
  vacantBeds,
  onCheckedIn,
  profileId,
}: {
  vacantBeds: Bed[]
  onCheckedIn: () => void
  profileId: string
}) {
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [checkInDate, setCheckInDate] = useState('')
  const [monthlyFee, setMonthlyFee] = useState('')
  const [bedId, setBedId] = useState(vacantBeds[0]?.id ?? '')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    await checkInStudent({
      profileId,
      guardianName,
      guardianPhone,
      bedId,
      checkInDate,
      monthlyFee: Number(monthlyFee),
    })
    onCheckedIn()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="guardianName" className="block text-sm font-medium text-on-surface-variant">Guardian Name</label>
        <input id="guardianName" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="guardianPhone" className="block text-sm font-medium text-on-surface-variant">Guardian Phone</label>
        <input id="guardianPhone" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="checkInDate" className="block text-sm font-medium text-on-surface-variant">Check-in Date</label>
        <input id="checkInDate" type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="monthlyFee" className="block text-sm font-medium text-on-surface-variant">Monthly Fee</label>
        <input id="monthlyFee" type="number" value={monthlyFee} onChange={(e) => setMonthlyFee(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="bed" className="block text-sm font-medium text-on-surface-variant">Bed</label>
        <select id="bed" value={bedId} onChange={(e) => setBedId(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
          {vacantBeds.map((bed) => (
            <option key={bed.id} value={bed.id}>{bed.bed_label}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Check In
      </button>
    </form>
  )
}
