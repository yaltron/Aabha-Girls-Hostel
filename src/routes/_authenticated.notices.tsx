import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchNotices, type Notice } from '../lib/notices'
import { NoticesList } from '../components/notices/NoticesList'

function NoticesPage() {
  const [notices, setNotices] = useState<Notice[]>([])

  useEffect(() => {
    fetchNotices().then(setNotices)
  }, [])

  return (
    <div className="space-y-8">
      <h2 className="font-display text-2xl text-on-surface">Notices</h2>
      <NoticesList notices={notices} />
    </div>
  )
}

export const Route = createFileRoute('/_authenticated/notices')({
  component: NoticesPage,
})
