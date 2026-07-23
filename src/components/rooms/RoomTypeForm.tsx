import { useState, type FormEvent } from 'react'
import { createRoomType, updateRoomType, type RoomType } from '../../lib/rooms'

const AMENITY_OPTIONS = [
  { key: 'attached_bathroom', label: 'Attached Bathroom' },
  { key: 'balcony', label: 'Balcony' },
  { key: 'geyser', label: 'Geyser / Hot Water' },
  { key: 'study_table', label: 'Study Table' },
  { key: 'wardrobe', label: 'Wardrobe' },
  { key: 'ac', label: 'AC' },
]

export function RoomTypeForm({ roomType, onSaved }: { roomType?: RoomType; onSaved: () => void }) {
  const [name, setName] = useState(roomType?.name ?? '')
  const [capacity, setCapacity] = useState(roomType?.capacity ?? 1)
  const [baseRent, setBaseRent] = useState(roomType?.base_rent ?? 0)
  const [deposit, setDeposit] = useState(roomType?.deposit ?? 0)
  const [amenities, setAmenities] = useState<string[]>(roomType?.amenities ?? [])
  const [error, setError] = useState<string | null>(null)

  function toggleAmenity(key: string) {
    setAmenities((current) => (current.includes(key) ? current.filter((a) => a !== key) : [...current, key]))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const input = { name, capacity, base_rent: baseRent, deposit, amenities }
      if (roomType) {
        await updateRoomType(roomType.id, input)
      } else {
        await createRoomType(input)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save room type')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="roomTypeName" className="block text-sm font-medium text-on-surface-variant">Name</label>
        <input id="roomTypeName" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeCapacity" className="block text-sm font-medium text-on-surface-variant">Capacity</label>
        <input id="roomTypeCapacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeBaseRent" className="block text-sm font-medium text-on-surface-variant">Monthly Rent (per bed)</label>
        <input id="roomTypeBaseRent" type="number" min={0} value={baseRent} onChange={(e) => setBaseRent(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="roomTypeDeposit" className="block text-sm font-medium text-on-surface-variant">Security Deposit</label>
        <input id="roomTypeDeposit" type="number" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      <fieldset className="space-y-2">
        <legend className="block text-sm font-medium text-on-surface-variant">Amenities</legend>
        {AMENITY_OPTIONS.map((option) => (
          <label key={option.key} className="flex items-center gap-2">
            <input type="checkbox" checked={amenities.includes(option.key)} onChange={() => toggleAmenity(option.key)} />
            {option.label}
          </label>
        ))}
      </fieldset>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        {roomType ? 'Save Changes' : 'Add Room Type'}
      </button>
    </form>
  )
}
