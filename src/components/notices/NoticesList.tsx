import type { Notice } from '../../lib/notices'

export function NoticesList({ notices }: { notices: Notice[] }) {
  return (
    <div className="space-y-4">
      {notices.map((notice) => (
        <div key={notice.id} className="bg-surface-container-lowest rounded-xxl shadow-premium p-6 space-y-2">
          <h3 className="font-display text-lg text-primary">{notice.title}</h3>
          <p className="text-on-surface-variant">{notice.body}</p>
        </div>
      ))}
    </div>
  )
}
