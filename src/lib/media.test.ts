import { describe, it, expect, vi } from 'vitest'

const mockMedia = [
  { id: 'media-1', category: 'highlight', url: 'https://x.supabase.co/storage/v1/object/public/site-media/a.jpg', caption: 'Common room', sort_order: 0 },
]

const uploadMock = vi.fn(() => Promise.resolve({ data: { path: 'highlight/a.jpg' }, error: null }))
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://x.supabase.co/storage/v1/object/public/site-media/highlight/a.jpg' } }))
const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const deleteEqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateEqMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('./supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ order: vi.fn(() => Promise.resolve({ data: mockMedia, error: null })) })),
        order: vi.fn(() => Promise.resolve({ data: mockMedia, error: null })),
      })),
      insert: insertMock,
      delete: vi.fn(() => ({ eq: deleteEqMock })),
      update: vi.fn(() => ({ eq: updateEqMock })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      })),
    },
  },
}))

describe('fetchMedia', () => {
  it('returns all media items ordered by sort_order', async () => {
    const { fetchMedia } = await import('./media')
    const items = await fetchMedia()
    expect(items).toEqual(mockMedia)
  })
})

describe('uploadMedia', () => {
  it('uploads the file then inserts a site_media row with the public URL', async () => {
    const { uploadMedia } = await import('./media')
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    await uploadMedia(file, 'highlight', 'Common room')
    expect(uploadMock).toHaveBeenCalled()
    expect(insertMock).toHaveBeenCalledWith({
      category: 'highlight',
      url: 'https://x.supabase.co/storage/v1/object/public/site-media/highlight/a.jpg',
      caption: 'Common room',
    })
  })
})

describe('deleteMedia', () => {
  it('deletes the given media row', async () => {
    const { deleteMedia } = await import('./media')
    await deleteMedia('media-1')
    expect(deleteEqMock).toHaveBeenCalledWith('id', 'media-1')
  })
})

describe('reorderMedia', () => {
  it('updates sort_order for the given media row', async () => {
    const { reorderMedia } = await import('./media')
    await reorderMedia('media-1', 2)
    expect(updateEqMock).toHaveBeenCalledWith('id', 'media-1')
  })
})
