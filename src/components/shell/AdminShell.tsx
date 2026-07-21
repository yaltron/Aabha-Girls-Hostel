import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AdminShell({ children }: { children: ReactNode }) {
  const { role } = useAuth()
  if (!role) return null

  return (
    <div>
      <Sidebar role={role} />
      <TopBar />
      <main className="ml-64 pt-24 px-gutter pb-section-gap print:ml-0 print:pt-0">{children}</main>
    </div>
  )
}
