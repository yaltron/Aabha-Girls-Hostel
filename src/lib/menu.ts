import { supabase } from './supabase'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export type MenuItem = {
  id: string
  day_of_week: number
  meal: MealType
  description: string
}

export async function fetchMenuItems(): Promise<MenuItem[]> {
  const { data, error } = await supabase.from('menu_items').select('*').order('day_of_week')
  if (error) throw error
  return (data ?? []) as MenuItem[]
}

export async function upsertMenuItem(dayOfWeek: number, meal: MealType, description: string): Promise<void> {
  const { error } = await supabase
    .from('menu_items')
    .upsert({ day_of_week: dayOfWeek, meal, description }, { onConflict: 'day_of_week,meal' })
  if (error) throw error
}
