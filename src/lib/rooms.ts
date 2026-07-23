import { supabase } from './supabase'

export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'notice_given'

export type Bed = {
  id: string
  room_id: string
  bed_label: string
  status: BedStatus
  hold_until: string | null
}

export type Room = {
  id: string
  room_number: string
  room_type_name: string
  beds: Bed[]
}

export type RoomType = {
  id: string
  name: string
  capacity: number
  base_rent: number
  deposit: number
  amenities: string[]
}

export type RoomAdminStatus = 'active' | 'under_maintenance' | 'blocked'
export type RoomDisplayStatus = 'available' | 'partially_filled' | 'full' | 'under_maintenance' | 'blocked'

export type RoomWithStatus = {
  id: string
  room_number: string
  floor: number
  wing: string | null
  room_type_id: string
  admin_status: RoomAdminStatus
  display_status: RoomDisplayStatus
}

export async function fetchRoomsWithBeds(): Promise<Room[]> {
  const { data, error } = await supabase.from('rooms').select('id, room_number, beds(*), room_types(name)')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    room_number: row.room_number,
    room_type_name: row.room_types?.name ?? '',
    beds: row.beds ?? [],
  })) as Room[]
}

export async function fetchRoomsWithStatus(): Promise<RoomWithStatus[]> {
  const { data, error } = await supabase.from('rooms_with_status').select('*')
  if (error) throw error
  return (data ?? []) as RoomWithStatus[]
}

export async function fetchRoomTypes(): Promise<RoomType[]> {
  const { data, error } = await supabase.from('room_types').select('*').order('name')
  if (error) throw error
  return (data ?? []) as RoomType[]
}

type RoomTypeInput = {
  name: string
  capacity: number
  base_rent: number
  deposit: number
  amenities: string[]
}

export async function createRoomType(input: RoomTypeInput): Promise<void> {
  const { error } = await supabase.from('room_types').insert(input)
  if (error) throw error
}

export async function updateRoomType(id: string, input: RoomTypeInput): Promise<void> {
  const { error } = await supabase.from('room_types').update(input).eq('id', id)
  if (error) throw error
}

type RoomInput = {
  room_number: string
  floor: number
  wing: string | null
  room_type_id: string
  admin_status: RoomAdminStatus
}

export async function createRoom(input: RoomInput): Promise<void> {
  const { error } = await supabase.from('rooms').insert(input)
  if (error) throw error
}

export async function updateRoom(id: string, input: RoomInput): Promise<void> {
  const { error } = await supabase.from('rooms').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteRoom(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_room', { p_room_id: id })
  if (error) throw error
}
