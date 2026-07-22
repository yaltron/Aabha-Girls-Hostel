import { useState, type FormEvent } from 'react'
import { updateSiteContent } from '../../lib/siteContent'

type HeroContent = { headline: string; subhead: string }
type Stat = { label: string; sublabel: string }
type TrustPoint = { title: string; description: string }
type IntroContent = { headline: string; text: string }
type ProtocolItem = { title: string; description: string }
type TeamMember = { name: string; quote: string }
type Team = { warden: TeamMember; owner: TeamMember }
type FeeRow = { component: string; description: string; amount: string }
type ContactContent = { phone: string; address: string }

const EMPTY_STAT: Stat = { label: '', sublabel: '' }
const EMPTY_TRUST_POINT: TrustPoint = { title: '', description: '' }
const EMPTY_PROTOCOL: ProtocolItem = { title: '', description: '' }
const EMPTY_MEMBER: TeamMember = { name: '', quote: '' }
const EMPTY_FEE_ROW: FeeRow = { component: '', description: '', amount: '' }

function fourStats(value: unknown): Stat[] {
  const arr = Array.isArray(value) ? (value as Stat[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_STAT })
}

function fourTrustPoints(value: unknown): TrustPoint[] {
  const arr = Array.isArray(value) ? (value as TrustPoint[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_TRUST_POINT })
}

function threeProtocolItems(value: unknown): ProtocolItem[] {
  const arr = Array.isArray(value) ? (value as ProtocolItem[]) : []
  return [0, 1, 2].map((i) => arr[i] ?? { ...EMPTY_PROTOCOL })
}

function fourFeeRows(value: unknown): FeeRow[] {
  const arr = Array.isArray(value) ? (value as FeeRow[]) : []
  return [0, 1, 2, 3].map((i) => arr[i] ?? { ...EMPTY_FEE_ROW })
}

export function SiteContentForm({
  content,
  onSaved,
}: {
  content: Record<string, unknown>
  onSaved: () => void
}) {
  const hero = (content.hero as HeroContent) ?? { headline: '', subhead: '' }
  const roomsHero = (content.rooms_hero as HeroContent) ?? { headline: '', subhead: '' }
  const transparencyIntro = (content.transparency_intro as IntroContent) ?? { headline: '', text: '' }
  const team = (content.team as Team) ?? { warden: { ...EMPTY_MEMBER }, owner: { ...EMPTY_MEMBER } }
  const contact = (content.contact as ContactContent) ?? { phone: '', address: '' }

  const [heroHeadline, setHeroHeadline] = useState(hero.headline)
  const [heroSubhead, setHeroSubhead] = useState(hero.subhead)
  const [stats, setStats] = useState<Stat[]>(fourStats(content.trust_stats))
  const [trustPoints, setTrustPoints] = useState<TrustPoint[]>(fourTrustPoints(content.trust_points))
  const [roomsHeroHeadline, setRoomsHeroHeadline] = useState(roomsHero.headline)
  const [roomsHeroSubhead, setRoomsHeroSubhead] = useState(roomsHero.subhead)
  const [introHeadline, setIntroHeadline] = useState(transparencyIntro.headline)
  const [introText, setIntroText] = useState(transparencyIntro.text)
  const [protocolItems, setProtocolItems] = useState<ProtocolItem[]>(threeProtocolItems(content.safety_protocol))
  const [wardenName, setWardenName] = useState(team.warden?.name ?? '')
  const [wardenQuote, setWardenQuote] = useState(team.warden?.quote ?? '')
  const [ownerName, setOwnerName] = useState(team.owner?.name ?? '')
  const [ownerQuote, setOwnerQuote] = useState(team.owner?.quote ?? '')
  const [feeRows, setFeeRows] = useState<FeeRow[]>(fourFeeRows(content.fee_schedule))
  const [contactPhone, setContactPhone] = useState(contact.phone)
  const [contactAddress, setContactAddress] = useState(contact.address)
  const [error, setError] = useState<string | null>(null)

  function updateStat(index: number, field: keyof Stat, value: string) {
    setStats((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function updateTrustPoint(index: number, field: keyof TrustPoint, value: string) {
    setTrustPoints((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function updateProtocolItem(index: number, field: keyof ProtocolItem, value: string) {
    setProtocolItems((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function updateFeeRow(index: number, field: keyof FeeRow, value: string) {
    setFeeRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await updateSiteContent('hero', { headline: heroHeadline, subhead: heroSubhead })
      await updateSiteContent('trust_stats', stats)
      await updateSiteContent('trust_points', trustPoints)
      await updateSiteContent('rooms_hero', { headline: roomsHeroHeadline, subhead: roomsHeroSubhead })
      await updateSiteContent('transparency_intro', { headline: introHeadline, text: introText })
      await updateSiteContent('safety_protocol', protocolItems)
      await updateSiteContent('team', {
        warden: { name: wardenName, quote: wardenQuote },
        owner: { name: ownerName, quote: ownerQuote },
      })
      await updateSiteContent('fee_schedule', feeRows)
      await updateSiteContent('contact', { phone: contactPhone, address: contactAddress })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save content')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Home Hero</h3>
        <div className="space-y-2">
          <label htmlFor="heroHeadline" className="block text-sm font-medium text-on-surface-variant">Hero Headline</label>
          <input id="heroHeadline" value={heroHeadline} onChange={(e) => setHeroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="heroSubhead" className="block text-sm font-medium text-on-surface-variant">Hero Subhead</label>
          <input id="heroSubhead" value={heroSubhead} onChange={(e) => setHeroSubhead(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Trust Stats (4)</h3>
        {stats.map((stat, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Stat ${i + 1} label`} placeholder="Stat label" value={stat.label} onChange={(e) => updateStat(i, 'label', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Stat ${i + 1} sublabel`} placeholder="Stat sublabel" value={stat.sublabel} onChange={(e) => updateStat(i, 'sublabel', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Why Parents Choose Us (4)</h3>
        {trustPoints.map((point, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Trust point ${i + 1} title`} placeholder="Trust point title" value={point.title} onChange={(e) => updateTrustPoint(i, 'title', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Trust point ${i + 1} description`} placeholder="Trust point description" value={point.description} onChange={(e) => updateTrustPoint(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Rooms Page Hero</h3>
        <div className="space-y-2">
          <label htmlFor="roomsHeroHeadline" className="block text-sm font-medium text-on-surface-variant">Headline</label>
          <input id="roomsHeroHeadline" value={roomsHeroHeadline} onChange={(e) => setRoomsHeroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="roomsHeroSubhead" className="block text-sm font-medium text-on-surface-variant">Subhead</label>
          <input id="roomsHeroSubhead" value={roomsHeroSubhead} onChange={(e) => setRoomsHeroSubhead(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Transparency Intro</h3>
        <div className="space-y-2">
          <label htmlFor="introHeadline" className="block text-sm font-medium text-on-surface-variant">Headline</label>
          <input id="introHeadline" value={introHeadline} onChange={(e) => setIntroHeadline(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="introText" className="block text-sm font-medium text-on-surface-variant">Text</label>
          <textarea id="introText" value={introText} onChange={(e) => setIntroText(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Safety Protocol (3)</h3>
        {protocolItems.map((item, i) => (
          <div key={i} className="grid grid-cols-2 gap-4">
            <input aria-label={`Protocol ${i + 1} title`} placeholder="Protocol title" value={item.title} onChange={(e) => updateProtocolItem(i, 'title', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Protocol ${i + 1} description`} placeholder="Protocol description" value={item.description} onChange={(e) => updateProtocolItem(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Team Bios</h3>
        <div className="space-y-2">
          <label htmlFor="wardenName" className="block text-sm font-medium text-on-surface-variant">Warden Name</label>
          <input id="wardenName" value={wardenName} onChange={(e) => setWardenName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="wardenQuote" className="block text-sm font-medium text-on-surface-variant">Warden Quote</label>
          <textarea id="wardenQuote" value={wardenQuote} onChange={(e) => setWardenQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="ownerName" className="block text-sm font-medium text-on-surface-variant">Owner Name</label>
          <input id="ownerName" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="ownerQuote" className="block text-sm font-medium text-on-surface-variant">Owner Quote</label>
          <textarea id="ownerQuote" value={ownerQuote} onChange={(e) => setOwnerQuote(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <p className="text-xs text-on-surface-variant">Upload warden/owner photos below under Photos - "team_warden" / "team_owner".</p>
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-4">
        <h3 className="font-display text-lg text-on-surface">Fee Schedule (4)</h3>
        {feeRows.map((row, i) => (
          <div key={i} className="grid grid-cols-3 gap-4">
            <input aria-label={`Fee ${i + 1} component`} placeholder="Fee component" value={row.component} onChange={(e) => updateFeeRow(i, 'component', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Fee ${i + 1} description`} placeholder="Fee description" value={row.description} onChange={(e) => updateFeeRow(i, 'description', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
            <input aria-label={`Fee ${i + 1} amount`} placeholder="Fee amount" value={row.amount} onChange={(e) => updateFeeRow(i, 'amount', e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
          </div>
        ))}
      </div>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Contact</h3>
        <div className="space-y-2">
          <label htmlFor="contactPhone" className="block text-sm font-medium text-on-surface-variant">Phone</label>
          <input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
        <div className="space-y-2">
          <label htmlFor="contactAddress" className="block text-sm font-medium text-on-surface-variant">Address</label>
          <input id="contactAddress" value={contactAddress} onChange={(e) => setContactAddress(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
        </div>
      </div>

      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Save All Content
      </button>
    </form>
  )
}
