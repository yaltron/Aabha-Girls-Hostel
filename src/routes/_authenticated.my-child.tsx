import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchMyChildProfile, fetchChildInvoices, fetchMyChildUpdate, type GuardianUpdate } from '../lib/guardian'
import { fetchNotices, type Notice } from '../lib/notices'
import type { Invoice } from '../lib/fees'
import { FeeStatus } from '../components/guardian/FeeStatus'
import { MonthlyUpdate } from '../components/guardian/MonthlyUpdate'
import { NoticesList } from '../components/notices/NoticesList'

function MyChildPage() {
  const [childName, setChildName] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [update, setUpdate] = useState<GuardianUpdate | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    fetchMyChildProfile().then((child) => {
      if (!child) return
      setChildName(child.full_name)
      fetchChildInvoices().then((rows) =>
        setInvoices(rows.map((row) => ({ ...row, student_id: child.id, student_name: child.full_name }))),
      )
    })
    fetchMyChildUpdate().then(setUpdate)
    fetchNotices().then(setNotices)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">{childName || 'My Child'}</h2>
      <FeeStatus invoices={invoices} />
      <MonthlyUpdate update={update} />
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/my-child')({
  component: MyChildPage,
})
