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
  const { data, error } = await supabase.from('students').select('*, profiles!students_id_fkey(full_name)')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id,
    full_name: row.profiles?.full_name ?? '',
    photo_url: row.photo_url,
    guardian_name: row.guardian_name,
    guardian_phone: row.guardian_phone,
    bed_id: row.bed_id,
    check_in_date: row.check_in_date,
    monthly_fee: row.monthly_fee,
  })) as Student[]
}

export type UnassignedProfile = { id: string; full_name: string }

export async function fetchUnassignedStudentProfiles(): Promise<UnassignedProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, students!students_id_fkey(id)')
    .eq('role', 'student')
  if (error) throw error
  return (data ?? [])
    .filter((row: any) => !row.students || row.students.length === 0)
    .map((row: any) => ({ id: row.id, full_name: row.full_name }))
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
