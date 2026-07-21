import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchStudents, type Student } from '../lib/students'
import { ResidentList } from '../components/students/ResidentList'

function ResidentsPage() {
  const [students, setStudents] = useState<Student[]>([])

  useEffect(() => {
    fetchStudents().then(setStudents)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Residents</h2>
      <ResidentList students={students} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/residents')({
  component: ResidentsPage,
})
