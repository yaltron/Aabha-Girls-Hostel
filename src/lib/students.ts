import { supabase } from './supabase'

export type Student = {
  id: string
  full_name: string
  photo_url: string | null
  guardian_name: string
  guardian_phone: string
  bed_id: string | null
  check_in_date: string | null
  monthly_fee: number | null
}

export async function fetchStudents(): Promise<Student[]> {
  const { data, error } = await supabase.from('students').select('*')
  if (error) throw error
  return (data ?? []) as Student[]
}

export async function checkInStudent(input: {
  profileId: string
  guardianName: string
  guardianPhone: string
  bedId: string
  checkInDate: string
  monthlyFee: number
  photoUrl?: string
}): Promise<void> {
  const { error } = await supabase.rpc('check_in_student', {
    p_profile_id: input.profileId,
    p_guardian_name: input.guardianName,
    p_guardian_phone: input.guardianPhone,
    p_bed_id: input.bedId,
    p_check_in_date: input.checkInDate,
    p_monthly_fee: input.monthlyFee,
    p_photo_url: input.photoUrl ?? null,
  })
  if (error) throw error
}
