import { useState, type FormEvent } from 'react'
import { enrollStudent } from '../../lib/students'

export function EnrollStudentForm({ onEnrolled }: { onEnrolled: (profileId: string) => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmedFullName = fullName.trim()
    const trimmedPhone = phone.trim()
    if (!trimmedFullName || !trimmedPhone) {
      setError('Full name and phone are required')
      return
    }

    try {
      const result = await enrollStudent(trimmedFullName, trimmedPhone)
      setGeneratedPassword(result.password)
      onEnrolled(result.profileId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll student')
    }
  }

  function handleEnrollAnother() {
    setFullName('')
    setPhone('')
    setError(null)
    setGeneratedPassword(null)
  }

  if (generatedPassword) {
    return (
      <div className="bg-secondary-container rounded-xxl p-6 space-y-2">
        <p className="font-medium text-secondary">Account created for {fullName}</p>
        <p className="text-sm text-on-surface-variant">Write this down and give it to the student now - it will not be shown again.</p>
        <p className="font-display text-lg text-on-surface">{generatedPassword}</p>
        <button
          type="button"
          onClick={handleEnrollAnother}
          className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform"
        >
          Enroll another student
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="enrollFullName" className="block text-sm font-medium text-on-surface-variant">Full Name</label>
        <input id="enrollFullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      <div className="space-y-2">
        <label htmlFor="enrollPhone" className="block text-sm font-medium text-on-surface-variant">Phone</label>
        <input id="enrollPhone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3" />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Enroll Student
      </button>
    </form>
  )
}
