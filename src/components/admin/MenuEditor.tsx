import { useState } from 'react'
import { upsertMenuItem, type MealType, type MenuItem } from '../../lib/menu'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner']

export function MenuEditor({ items, onChanged }: { items: MenuItem[]; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null)

  function descriptionFor(dayOfWeek: number, meal: MealType): string {
    return items.find((item) => item.day_of_week === dayOfWeek && item.meal === meal)?.description ?? ''
  }

  async function handleSave(dayOfWeek: number, meal: MealType, description: string) {
    setError(null)
    try {
      await upsertMenuItem(dayOfWeek, meal, description)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save menu item')
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
            <tr>
              <th className="px-6 py-4">Day</th>
              {MEALS.map((meal) => (
                <th key={meal} className="px-6 py-4 capitalize">{meal}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {DAYS.map((dayName, dayOfWeek) => (
              <tr key={dayName}>
                <td className="px-6 py-4 font-medium text-on-surface">{dayName}</td>
                {MEALS.map((meal) => (
                  <td key={meal} className="px-6 py-4">
                    <input
                      aria-label={`${dayName} ${meal}`}
                      defaultValue={descriptionFor(dayOfWeek, meal)}
                      onBlur={(e) => handleSave(dayOfWeek, meal, e.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-3 py-2 text-sm"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
