import { useState, type FormEvent } from 'react'
import { linkGuardian, type UnlinkedGuardianProfile } from '../../lib/students'

export function LinkGuardianForm({
  studentId,
  unlinkedGuardians,
  onLinked,
}: {
  studentId: string
  unlinkedGuardians: UnlinkedGuardianProfile[]
  onLinked: () => void
}) {
  const [guardianId, setGuardianId] = useState(unlinkedGuardians[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await linkGuardian(studentId, guardianId)
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not link guardian')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="guardianProfile" className="block text-sm font-medium text-on-surface-variant">
          Guardian Account
        </label>
        <select
          id="guardianProfile"
          value={guardianId}
          onChange={(e) => setGuardianId(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        >
          {unlinkedGuardians.map((guardian) => (
            <option key={guardian.id} value={guardian.id}>
              {guardian.full_name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Link Guardian
      </button>
    </form>
  )
}
