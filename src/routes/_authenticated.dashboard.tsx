import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { OwnerDashboard } from '../components/dashboard/OwnerDashboard'
import { WardenDashboard } from '../components/dashboard/WardenDashboard'
import { StudentDashboard } from '../components/dashboard/StudentDashboard'
import { GuardianDashboard } from '../components/dashboard/GuardianDashboard'

function DashboardPage() {
  const { role } = useAuth()

  switch (role) {
    case 'owner':
      return <OwnerDashboard />
    case 'warden':
      return <WardenDashboard />
    case 'student':
      return <StudentDashboard />
    case 'guardian':
      return <GuardianDashboard />
    default:
      return null
  }
}

export const Route = createFileRoute('/_authenticated/dashboard')({
  component: DashboardPage,
})
