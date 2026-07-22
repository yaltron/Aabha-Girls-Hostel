import { createFileRoute } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { submitInquiry, submitBooking } from '../lib/publicSite'
import { PublicShell } from '../components/public/PublicShell'

function ContactPage() {
  const [inquiryName, setInquiryName] = useState('')
  const [inquiryPhone, setInquiryPhone] = useState('')
  const [inquiryMessage, setInquiryMessage] = useState('')
  const [inquirySent, setInquirySent] = useState(false)
  const [inquiryError, setInquiryError] = useState<string | null>(null)

  const [bookingName, setBookingName] = useState('')
  const [bookingPhone, setBookingPhone] = useState('')
  const [guardianPhone, setGuardianPhone] = useState('')
  const [roomType, setRoomType] = useState<'single' | 'twin' | 'triple'>('single')
  const [preferredDate, setPreferredDate] = useState('')
  const [bookingSent, setBookingSent] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  async function handleInquirySubmit(e: FormEvent) {
    e.preventDefault()
    setInquiryError(null)
    try {
      await submitInquiry({ name: inquiryName, phone: inquiryPhone, message: inquiryMessage || undefined })
      setInquirySent(true)
    } catch (err) {
      setInquiryError(err instanceof Error ? err.message : 'Could not send inquiry')
    }
  }

  async function handleBookingSubmit(e: FormEvent) {
    e.preventDefault()
    setBookingError(null)
    try {
      await submitBooking({ name: bookingName, phone: bookingPhone, guardianPhone, roomType, preferredDate })
      setBookingSent(true)
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Could not send reservation request')
    }
  }

  return (
    <PublicShell>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
                Send Inquiry
              </button>
            </form>
          )}
        </section>

        <section className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
          <h2 className="font-display text-xl text-on-surface">Reserve a Bed</h2>
          {bookingSent ? (
            <p className="text-primary">Reservation request sent - we'll confirm shortly.</p>
          ) : (
            <form onSubmit={handleBookingSubmit} className="space-y-4">
              <input value={bookingName} onChange={(e) => setBookingName(e.target.value)} placeholder="Name" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <input value={bookingPhone} onChange={(e) => setBookingPhone(e.target.value)} placeholder="Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} placeholder="Guardian Phone" className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              <select value={roomType} onChange={(e) => setRoomType(e.target.value as typeof roomType)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3">
                <option value="single">Single</option>
                <option value="twin">Twin</option>
                <option value="triple">Triple</option>
              </select>
              <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
              {bookingError && <p className="text-error text-sm">{bookingError}</p>}
              <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
                Reserve a Bed
              </button>
            </form>
          )}
        </section>
      </div>
    </PublicShell>
  )
}

export const Route = createFileRoute('/contact')({
  component: ContactPage,
})
