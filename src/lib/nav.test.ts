import { describe, it, expect } from 'vitest'
import { getNavItemsForRole } from './nav'

describe('getNavItemsForRole', () => {
  it('gives owner the full nav including financial config', () => {
    const items = getNavItemsForRole('owner').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).toContain('Financial Settings')
  })

  it('hides financial config from warden', () => {
    const items = getNavItemsForRole('warden').map((i) => i.label)
    expect(items).toContain('Dashboard')
    expect(items).not.toContain('Financial Settings')
  })

  it('gives student only their own dashboard', () => {
    const items = getNavItemsForRole('student').map((i) => i.label)
    expect(items).toEqual(['Dashboard'])
  })

  it('gives guardian only their own dashboard', () => {
    const items = getNavItemsForRole('guardian').map((i) => i.label)
    expect(items).toEqual(['Dashboard'])
  })
})
