import { useState, type FormEvent } from 'react'
import { postNotice } from '../../lib/notices'

export function PostNoticeForm({ onPosted }: { onPosted: () => void }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [guardianVisible, setGuardianVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await postNotice({ title, body, guardianVisible })
      setTitle('')
      setBody('')
      setGuardianVisible(false)
      onPosted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post notice')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-on-surface-variant">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <div className="space-y-2">
        <label htmlFor="body" className="block text-sm font-medium text-on-surface-variant">Body</label>
        <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" required />
      </div>
      <label className="flex items-center gap-2 text-sm text-on-surface-variant">
        <input type="checkbox" checked={guardianVisible} onChange={(e) => setGuardianVisible(e.target.checked)} />
        Visible to guardians
      </label>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Post Notice
      </button>
    </form>
  )
}
