import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostNoticeForm } from './PostNoticeForm'

const postNotice = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/notices', () => ({
  postNotice: (...args: unknown[]) => postNotice(...args),
}))

describe('PostNoticeForm', () => {
  it('calls postNotice with the entered fields on submit', async () => {
    const onPosted = vi.fn()
    render(<PostNoticeForm onPosted={onPosted} />)

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Winter Break Schedule' } })
    fireEvent.change(screen.getByLabelText(/body/i), { target: { value: 'Hostel closes Dec 20.' } })
    fireEvent.click(screen.getByLabelText(/visible to guardians/i))
    fireEvent.click(screen.getByRole('button', { name: /post notice/i }))

    await waitFor(() =>
      expect(postNotice).toHaveBeenCalledWith({
        title: 'Winter Break Schedule',
        body: 'Hostel closes Dec 20.',
        guardianVisible: true,
      }),
    )
    expect(onPosted).toHaveBeenCalled()
  })
})
