import type { GuardianUpdate } from '../../lib/guardian'

export function MonthlyUpdate({ update }: { update: GuardianUpdate | null }) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
      <h3 className="font-display text-lg text-primary">This Month's Update</h3>
      {update ? (
        <p className="text-on-surface-variant">{update.message}</p>
      ) : (
        <p className="text-on-surface-variant italic">No update posted yet this month.</p>
      )}
    </div>
  )
}
