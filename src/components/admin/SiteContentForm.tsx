import { useState, type FormEvent } from 'react'
import { updateSiteContent } from '../../lib/siteContent'

type HeroContent = { headline: string; subhead: string }
type AboutContent = { text: string }

export function SiteContentForm({
  content,
  onSaved,
}: {
  content: Record<string, unknown>
  onSaved: () => void
}) {
  const hero = (content.hero as HeroContent) ?? { headline: '', subhead: '' }
  const about = (content.about as AboutContent) ?? { text: '' }

  const [heroHeadline, setHeroHeadline] = useState(hero.headline)
  const [heroSubhead, setHeroSubhead] = useState(hero.subhead)
  const [aboutText, setAboutText] = useState(about.text)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await updateSiteContent('hero', { headline: heroHeadline, subhead: heroSubhead })
      await updateSiteContent('about', { text: aboutText })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save content')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xxl shadow-premium p-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="heroHeadline" className="block text-sm font-medium text-on-surface-variant">Hero Headline</label>
        <input
          id="heroHeadline"
          value={heroHeadline}
          onChange={(e) => setHeroHeadline(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="heroSubhead" className="block text-sm font-medium text-on-surface-variant">Hero Subhead</label>
        <input
          id="heroSubhead"
          value={heroSubhead}
          onChange={(e) => setHeroSubhead(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="aboutText" className="block text-sm font-medium text-on-surface-variant">About</label>
        <textarea
          id="aboutText"
          value={aboutText}
          onChange={(e) => setAboutText(e.target.value)}
          className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-3"
        />
      </div>
      {error && <p className="text-error text-sm">{error}</p>}
      <button type="submit" className="w-full bg-primary text-on-primary py-4 rounded-full font-medium active:scale-95 transition-transform">
        Save
      </button>
    </form>
  )
}
