import { supabase } from './supabase'

export type BookingStatus = 'pending' | 'approved' | 'declined'

export type Booking = {
  id: string
  name: string
  phone: string
  guardian_phone: string
  room_type: 'single' | 'twin' | 'triple'
  preferred_date: string
  status: BookingStatus
  reserved_bed_id: string | null
  created_at: string
}

export async function fetchPendingBookings(): Promise<Booking[]> {
  const { data, error } = await supabase.from('bookings').select('*').eq('status', 'pending')
  if (error) throw error
  return (data ?? []) as Booking[]
}

export async function fetchApprovedBookings(): Promise<Booking[]> {
  const { data, error } = await supabase.from('bookings').select('*').eq('status', 'approved')
  if (error) throw error
  return (data ?? []) as Booking[]
}

export async function approveBooking(bookingId: string, bedId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_booking', { p_booking_id: bookingId, p_bed_id: bedId })
  if (error) throw error
}

export async function declineBooking(bookingId: string): Promise<void> {
  const { error } = await supabase.from('bookings').update({ status: 'declined' }).eq('id', bookingId)
  if (error) throw error
}
