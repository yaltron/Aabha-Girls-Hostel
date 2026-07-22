import { supabase } from './supabase'

export type Review = {
  id: string
  author_name: string
  quote: string
  display_order: number
  is_published: boolean
}

export async function fetchReviews(): Promise<Review[]> {
  const { data, error } = await supabase.from('reviews').select('*').order('display_order')
  if (error) throw error
  return (data ?? []) as Review[]
}

export async function createReview(input: { authorName: string; quote: string }): Promise<void> {
  const { error } = await supabase.from('reviews').insert({ author_name: input.authorName, quote: input.quote })
  if (error) throw error
}

export async function updateReview(
  id: string,
  input: { authorName?: string; quote?: string; isPublished?: boolean; displayOrder?: number },
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.authorName !== undefined) patch.author_name = input.authorName
  if (input.quote !== undefined) patch.quote = input.quote
  if (input.isPublished !== undefined) patch.is_published = input.isPublished
  if (input.displayOrder !== undefined) patch.display_order = input.displayOrder

  const { error } = await supabase.from('reviews').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteReview(id: string): Promise<void> {
  const { error } = await supabase.from('reviews').delete().eq('id', id)
  if (error) throw error
}
