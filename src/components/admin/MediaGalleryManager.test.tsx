import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MediaGalleryManager } from './MediaGalleryManager'
import type { MediaItem } from '../../lib/media'

const uploadMedia = vi.fn().mockResolvedValue(undefined)
const deleteMedia = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/media', () => ({
  uploadMedia: (...args: unknown[]) => uploadMedia(...args),
  deleteMedia: (...args: unknown[]) => deleteMedia(...args),
}))

const items: MediaItem[] = [
  { id: 'media-1', category: 'highlight', url: 'https://x/a.jpg', caption: 'Common room', sort_order: 0 },
]

describe('MediaGalleryManager', () => {
  it('renders existing items and deletes one on click', async () => {
    const onChanged = vi.fn()
    render(<MediaGalleryManager category="highlight" items={items} onChanged={onChanged} />)

    expect(screen.getByText('Common room')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(deleteMedia).toHaveBeenCalledWith('media-1'))
    expect(onChanged).toHaveBeenCalled()
  })

  it('uploads a selected file for the given category', async () => {
    const onChanged = vi.fn()
    render(<MediaGalleryManager category="highlight" items={[]} onChanged={onChanged} />)

    const file = new File(['x'], 'b.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/upload photo/i), { target: { files: [file] } })

    await waitFor(() => expect(uploadMedia).toHaveBeenCalledWith(file, 'highlight', undefined))
    expect(onChanged).toHaveBeenCalled()
  })
})
