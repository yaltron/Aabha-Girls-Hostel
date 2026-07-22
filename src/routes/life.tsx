import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicWeeklyMenu, fetchPublicSiteContent, type PublicMenuItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function LifePage() {
  const [menu, setMenu] = useState<PublicMenuItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicWeeklyMenu().then(setMenu)
    fetchPublicSiteContent().then(setContent)
  }, [])

  const safetyRules = (content.safety_rules as { text?: string } | undefined)?.text ?? ''

  return (
    <PublicShell>
      <div className="space-y-8">
        <h1 className="font-display text-3xl text-primary">Life at Aabha</h1>

        <div className="space-y-4">
          <h2 className="font-display text-xl text-on-surface">This Week's Menu</h2>
          <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-outline-variant/10">
                {DAYS.map((dayName, dayOfWeek) => (
                  <tr key={dayName}>
                    <td className="px-4 py-3 font-medium">{dayName}</td>
                    {(['breakfast', 'lunch', 'dinner'] as const).map((meal) => (
                      <td key={meal} className="px-4 py-3 text-on-surface-variant">
                        {menu.find((m) => m.day_of_week === dayOfWeek && m.meal === meal)?.description ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {safetyRules && (
          <div className="space-y-2">
            <h2 className="font-display text-xl text-on-surface">Safety &amp; Rules</h2>
            <p className="text-on-surface-variant">{safetyRules}</p>
          </div>
        )}
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/life')({
  component: LifePage,
})
