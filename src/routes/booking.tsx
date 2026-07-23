import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { submitInquiry, submitBooking, fetchPublicSiteContent } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

// Supabase throws plain objects (PostgrestError), not Error instances, so
// `err instanceof Error` is always false for them - falling through to the
// generic fallback and hiding the real message. This reads .message off
// whatever shape the error actually is.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

function BookingPage() {
  const [content, setContent] = useState<Record<string, unknown>>({})

  useEffect(() => {
    fetchPublicSiteContent().then(setContent)
  }, [])

  const contact = (content.contact as { phone?: string } | undefined) ?? {}

  const [inquiryName, setInquiryName] = useState('')
  const [inquiryPhone, setInquiryPhone] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquirySent, setInquirySent] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)

  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [guardianName, setGuardianName] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [roomType, setRoomType] = useState<'single' | 'twin' | 'triple'>('single')
  const [preferredDate, setPreferredDate] = useState('')
  const [note, setNote] = useState('')
  const [bookingSent, setBookingSent] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  async function handleInquirySubmit(e: FormEvent) {
    e.preventDefault()
    setInquiryError(null)
    try {
      await submitInquiry({ name: inquiryName, phone: inquiryPhone, message: inquiryMessage || undefined })
      setInquirySent(true)
    } catch (err) {
      setInquiryError(errorMessage(err, 'Could not send inquiry'))
    }
  }

  async function handleBookingSubmit(e: FormEvent) {
    e.preventDefault()
    setBookingError(null)
    try {
      await submitBooking({
        name: bookingName,
        phone: bookingPhone,
        guardianName: guardianName || undefined,
        guardianPhone,
        emergencyContactName: emergencyContactName || undefined,
        emergencyContactPhone: emergencyContactPhone || undefined,
        roomType,
        preferredDate,
        note: note || undefined,
      })
      setBookingSent(true)
    } catch (err) {
      setBookingError(errorMessage(err, 'Could not send reservation request'))
    }
  }

  return (
    <PublicShell>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
            <h2 className="font-display text-xl text-on-surface">Ask a Question</h2>
            {inquirySent ? (
              <p className="text-primary">Thanks - we'll get back to you soon.</p>
            ) : (
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <input value={inquiryName} onChange={(e) => setInquiryName(e.target.value)} placeholder="Name" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                <input value={inquiryPhone} onChange={(e) => setInquiryPhone(e.target.value)} placeholder="Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                <textarea value={inquiryMessage} onChange={(e) => setInquiryMessage(e.target.value)} placeholder="Message" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                {inquiryError && <p className="text-error text-sm">{inquiryError}</p>}
                <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">Send Inquiry</button>
              </form>
            )}
          </section>

          <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
            <h2 className="font-display text-xl text-on-surface">Reserve a Bed</h2>
            {bookingSent ? (
              <p className="text-primary">Reservation request sent - we'll confirm shortly.</p>
            ) : (
              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={bookingName} onChange={(e) => setBookingName(e.target.value)} placeholder="Student Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                  <input value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} placeholder="Student Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Guardian Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                  <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="Guardian Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Emergency Contact Name" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                  <input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="Emergency Contact Phone" className="bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select value={roomType} onChange={(e) => setRoomType(e.target.value as typeof roomType)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3">
                    <option value="single">Single</option>
                    <option value="twin">Twin</option>
                    <option value="triple">Triple</option>
                  </select>
                  <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
                </div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything we should know? (optional)" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
                {bookingError && <p className="text-error text-sm">{bookingError}</p>}
                <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">Reserve a Bed</button>
              </form>
            )}
          </section>
        </div>

        <aside className="bg-surface-container-low rounded-xxl p-8 space-y-3 h-fit">
          <h3 className="font-display text-lg text-on-surface">Need Help?</h3>
          <p className="text-on-surface-variant text-sm">Our concierge is available to assist with your booking.</p>
          {contact.phone && <a href={`tel:${contact.phone}`} className="block text-primary font-medium">{contact.phone}</a>}
        </aside>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/booking')({
  component: BookingPage,
})
