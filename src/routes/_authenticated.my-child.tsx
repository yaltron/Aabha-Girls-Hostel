import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyChildProfile, fetchChildInvoices, fetchMyChildUpdate, type GuardianUpdate } from '../lib/guardian'
import { fetchNotices, type Notice } from '../lib/notices'
import type { Invoice } from '../lib/fees'
import { FeeStatus } from '../components/guardian/FeeStatus'
import { GuardianPaymentForm } from '../components/guardian/GuardianPaymentForm'
import { MonthlyUpdate } from '../components/guardian/MonthlyUpdate'
import { NoticesList } from '../components/notices/NoticesList'

function MyChildPage() {
  const [childName, setChildName] = useState('')
  const [childId, setChildId] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [update, setUpdate] = useState<GuardianUpdate | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  function refetchInvoices(id: string, name: string) {
    fetchChildInvoices().then((rows) =>
      setInvoices(rows.map((row) => ({ ...row, student_id: id, student_name: name }))),
    )
  }

  useEffect(() => {
    fetchMyChildProfile().then((child) => {
      if (!child) return
      setChildName(child.full_name)
      setChildId(child.id)
      refetchInvoices(child.id, child.full_name)
    })
    fetchMyChildUpdate().then(setUpdate)
    fetchNotices().then(setNotices)
  }, [])

  function handlePaid() {
    setSelectedInvoiceId(null)
    refetchInvoices(childId, childName)
  }

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">{childName || 'My Child'}</h2>
      <FeeStatus invoices={invoices} onPay={(invoice) => setSelectedInvoiceId(invoice.id)} />
      {selectedInvoiceId && <GuardianPaymentForm invoiceId={selectedInvoiceId} onPaid={handlePaid} />}
      <MonthlyUpdate update={update} />
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-child')({
  component: MyChildPage,
})
