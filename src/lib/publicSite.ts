import { supabase } from './supabase'

export type PublicRoomAvailability = {
  room_type: 'single' | 'twin' | 'triple'
  monthly_price: number
  beds_available: number
}

export type PublicMenuItem = {
  day_of_week: number
  meal: 'breakfast' | 'lunch' | 'dinner'
  description: string
}

export type PublicNotice = {
  id: string
  title: string
  body: string
  created_at: string
}

export type PublicMediaItem = {
  id: string
  category: string
  url: string
  caption: string | null
}

export type PublicReview = {
  id: string
  author_name: string
  quote: string
}

export async function fetchPublicRoomAvailability(): Promise<PublicRoomAvailability[]> {
  const { data, error } = await supabase.from('public_room_availability').select('*')
  if (error) throw error
  return (data ?? []) as PublicRoomAvailability[]
}

export async function fetchPublicWeeklyMenu(): Promise<PublicMenuItem[]> {
  const { data, error } = await supabase.from('public_weekly_menu').select('*')
  if (error) throw error
  return (data ?? []) as PublicMenuItem[]
}

export async function fetchPublicNotices(): Promise<PublicNotice[]> {
  const { data, error } = await supabase.from('public_notices').select('*')
  if (error) throw error
  return (data ?? []) as PublicNotice[]
}

export async function fetchPublicSiteContent(): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('public_site_content').select('*')
  if (error) throw error
  const map: Record<string, unknown> = {}
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    map[row.key] = row.value
  }
  return map
}

export async function fetchPublicMedia(category?: string): Promise<PublicMediaItem[]> {
  const { data, error } = await supabase.from('public_site_media').select('*')
  if (error) throw error
  const items = (data ?? []) as PublicMediaItem[]
  return category ? items.filter((item) => item.category === category) : items
}

export async function fetchPublicReviews(): Promise<PublicReview[]> {
  const { data, error } = await supabase.from('public_reviews').select('*')
  if (error) throw error
  return (data ?? []) as PublicReview[]
}

export async function submitInquiry(input: { name: string; phone: string; message?: string }): Promise<void> {
  const { error } = await supabase.from('inquiries').insert({
    name: input.name,
    phone: input.phone,
    message: input.message ?? null,
  })
  if (error) throw error
}

export async function submitBooking(input: {
  name: string
  phone: string
  guardianPhone: string
  roomType: 'single' | 'twin' | 'triple'
  preferredDate: string
}): Promise<void> {
  const { error } = await supabase.from('bookings').insert({
    name: input.name,
    phone: input.phone,
    guardian_phone: input.guardianPhone,
    room_type: input.roomType,
    preferred_date: input.preferredDate,
  })
  if (error) throw error
}
