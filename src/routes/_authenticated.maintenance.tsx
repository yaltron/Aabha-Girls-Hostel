import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyTickets, type Ticket } from '../lib/maintenance'
import { TicketForm } from '../components/maintenance/TicketForm'
import { TicketList } from '../components/maintenance/TicketList'

function MaintenancePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])

  function refetch() {
    fetchMyTickets().then(setTickets)
  }

  useEffect(() => {
    refetch()
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Maintenance</h2>
      <TicketForm onRaised={refetch} />
      <TicketList tickets={tickets} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/maintenance')({
  component: MaintenancePage,
})
