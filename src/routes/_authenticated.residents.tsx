import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchStudents, fetchUnassignedStudentProfiles, type Student, type UnassignedProfile } from '../lib/students'
import { fetchRoomsWithBeds, type Room } from '../lib/rooms'
import { ResidentList } from '../components/students/ResidentList'
import { CheckInForm } from '../components/students/CheckInForm'

function ResidentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [unassignedProfiles, setUnassignedProfiles] = useState<UnassignedProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')

  function refetchAll() {
    fetchStudents().then(setStudents)
    fetchRoomsWithBeds().then(setRooms)
    fetchUnassignedStudentProfiles().then((profiles) => {
      setUnassignedProfiles(profiles)
      setSelectedProfileId((current) => (profiles.some((p) => p.id === current) ? current : ''))
    })
  }

  useEffect(() => {
    refetchAll()
  }, [])

  function handleCheckedIn() {
    setSelectedProfileId('')
    refetchAll()
  }

  const vacantBeds = rooms.flatMap((r) => r.beds).filter((b) => b.status === 'vacant')

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Residents</h2>

      <div className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
        <h3 className="font-display text-lg text-on-surface">Check In a Student</h3>
        {unassignedProfiles.length === 0 ? (
          <p className="text-on-surface-variant text-sm">
            No pending student accounts to check in - create one via the Supabase dashboard first
          </p>
        ) : (
          <div className="space-y-2">
            <label htmlFor="unassignedProfile" className="block text-sm font-medium text-on-surface-variant">
              Student Account
            </label>
            <select
              id="unassignedProfile"
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
            >
              <option value="">Select a student...</option>
              {unassignedProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
        {selectedProfileId && vacantBeds.length > 0 && (
          <CheckInForm vacantBeds={vacantBeds} profileId={selectedProfileId} onCheckedIn={handleCheckedIn} />
        )}
      </div>

      <ResidentList students={students} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/residents')({
  component: ResidentsPage,
})
