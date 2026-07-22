import { useState, type ChangeEvent } from 'react'
import { uploadMedia, deleteMedia, type MediaCategory, type MediaItem } from '../../lib/media'

export function MediaGalleryManager({
  category,
  items,
  onChanged,
}: {
  category: MediaCategory
  items: MediaItem[]
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await uploadMedia(file, category, undefined)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteMedia(id)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor={`upload-${category}`} className="block text-sm font-medium text-on-surface-variant">
          Upload Photo
        </label>
        <input id={`upload-${category}`} type="file" accept="image/*" onChange={handleUpload} />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => (
          <div key={item.id} className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
            <img src={item.url} alt={item.caption ?? ''} className="w-full h-32 object-cover" />
            <div className="p-3 space-y-2">
              {item.caption && <p className="text-xs text-on-surface-variant">{item.caption}</p>}
              <button onClick={() => handleDelete(item.id)} className="text-error text-xs font-medium hover:underline">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
