import { supabase } from './supabase'

export type MediaCategory = 'highlight' | 'room_single' | 'room_twin' | 'room_triple' | 'facility'

export type MediaItem = {
  id: string
  category: MediaCategory
  url: string
  caption: string | null
  sort_order: number
}

export async function fetchMedia(category?: MediaCategory): Promise<MediaItem[]> {
  let query = supabase.from('site_media').select('*')
  if (category) query = query.eq('category', category)
  const { data, error } = await query.order('sort_order')
  if (error) throw error
  return (data ?? []) as MediaItem[]
}

export async function uploadMedia(file: File, category: MediaCategory, caption?: string): Promise<void> {
  const path = `${category}/${file.name}`
  const { error: uploadError } = await supabase.storage.from('site-media').upload(path, file)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('site-media').getPublicUrl(path)

  const { error } = await supabase.from('site_media').insert({
    category,
    url: data.publicUrl,
    caption: caption ?? null,
  })
  if (error) throw error
}

export async function deleteMedia(id: string): Promise<void> {
  const { error } = await supabase.from('site_media').delete().eq('id', id)
  if (error) throw error
}

export async function reorderMedia(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('site_media').update({ sort_order: sortOrder }).eq('id', id)
  if (error) throw error
}
