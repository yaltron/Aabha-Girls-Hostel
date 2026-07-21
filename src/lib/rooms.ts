import { supabase } from './supabase'

export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'notice_given'

export type Bed = {
  id: string
  room_id: string
  bed_label: string
  status: BedStatus
}

export type Room = {
  id: string
  room_number: string
  room_type: 'single' | 'twin' | 'triple'
  capacity: number
  monthly_price: number
  beds: Bed[]
}

export async function fetchRoomsWithBeds(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('*, beds(*)')
  if (error) throw error
  return (data ?? []) as Room[]
}

export async function createRoom(input: {
  room_number: string
  room_type: Room['room_type']
  capacity: number
  monthly_price: number
}): Promise<void> {
  const { error } = await supabase.from('rooms').insert(input)
  if (error) throw error
}
