import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchPublicWeeklyMenu, fetchPublicSiteContent, fetchPublicMedia, type PublicMenuItem, type PublicMediaItem } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MEALS = ['breakfast', 'lunch', 'dinner'] as const

type ProtocolItem = { title: string; description: string }
type TeamMember = { name: string; quote: string }
type FeeRow = { component: string; description: string; amount: string }

function TransparencyPage() {
  const [menu, setMenu] = useState<PublicMenuItem[]>([])
  const [content, setContent] = useState<Record<string, unknown>>({})
  const [media, setMedia] = useState<PublicMediaItem[]>([])

  useEffect(() => {
    fetchPublicWeeklyMenu().then(setMenu)
    fetchPublicSiteContent().then(setContent)
    fetchPublicMedia().then(setMedia)
  }, [])

  const intro = (content.transparency_intro as { headline?: string; text?: string } | undefined) ?? {}
  const protocolItems = (content.safety_protocol as ProtocolItem[] | undefined) ?? []
  const team = (content.team as { warden?: TeamMember; owner?: TeamMember } | undefined) ?? {}
  const feeRows = (content.fee_schedule as FeeRow[] | undefined) ?? []
  const contact = (content.contact as { phone?: string; address?: string } | undefined) ?? {}
  const wardenPhoto = media.find((m) => m.category === 'team_warden')?.url
  const ownerPhoto = media.find((m) => m.category === 'team_owner')?.url

  return (
    <PublicShell>
      <div className="space-y-16">
        <div className="space-y-3 max-w-2xl">
          <h1 className="font-display text-3xl text-on-surface">{intro.headline ?? 'Transparency is Our Commitment'}</h1>
          <p className="text-on-surface-variant">{intro.text}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden overflow-x-auto">
            <h2 className="font-display text-lg text-on-surface p-6 pb-0">Weekly Meal Plan</h2>
            <table className="w-full text-left text-sm mt-4">
              <thead className="text-on-surface-variant uppercase text-xs">
                <tr>
                  <th className="px-6 py-3">Day</th>
                  {MEALS.map((meal) => (
                    <th key={meal} className="px-6 py-3 capitalize">{meal}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {DAYS.map((dayName, dayOfWeek) => (
                  <tr key={dayName}>
                    <td className="px-6 py-3 font-medium text-on-surface">{dayName}</td>
                    {MEALS.map((meal) => (
                      <td key={meal} className="px-6 py-3 text-on-surface-variant">
                        {menu.find((m) => m.day_of_week === dayOfWeek && m.meal === meal)?.description ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-primary text-on-primary rounded-xxl p-6 space-y-4">
            <h2 className="font-display text-lg">Our Safety Protocol</h2>
            {protocolItems.map((item, i) => (
              <div key={i} className="space-y-1">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm opacity-90">{item.description}</p>
              </div>
            ))}
            {contact.phone && (
              <div className="pt-4 border-t border-on-primary/20">
                <p className="text-xs uppercase tracking-wide opacity-80">Emergency Support</p>
                <a href={`tel:${contact.phone}`} className="font-medium">{contact.phone}</a>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <h2 className="font-display text-2xl text-on-surface text-center">The Hearts Behind the House</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {team.warden && (
              <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex gap-4">
                {wardenPhoto && <img src={wardenPhoto} alt={team.warden.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />}
                <div>
                  <p className="text-xs uppercase tracking-wide text-secondary">Hostel Warden</p>
                  <p className="font-display text-lg text-on-surface">{team.warden.name}</p>
                  <p className="text-on-surface-variant text-sm mt-1">"{team.warden.quote}"</p>
                </div>
              </div>
            )}
            {team.owner && (
              <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 flex gap-4">
                {ownerPhoto && <img src={ownerPhoto} alt={team.owner.name} className="w-20 h-20 rounded-full object-cover flex-shrink-0" />}
                <div>
                  <p className="text-xs uppercase tracking-wide text-secondary">Founder &amp; Owner</p>
                  <p className="font-display text-lg text-on-surface">{team.owner.name}</p>
                  <p className="text-on-surface-variant text-sm mt-1">"{team.owner.quote}"</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface-container-low rounded-xxl p-8 space-y-6">
          <h2 className="font-display text-2xl text-on-surface">Clear Fee Structure</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {feeRows.map((row, i) => (
              <div key={i} className="bg-surface-container-lowest rounded-xxl p-6 flex justify-between items-center">
                <div>
                  <p className="font-medium text-on-surface">{row.component}</p>
                  <p className="text-on-surface-variant text-sm">{row.description}</p>
                </div>
                <p className="text-primary font-display text-lg">{row.amount}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/transparency')({
  component: TransparencyPage,
})
