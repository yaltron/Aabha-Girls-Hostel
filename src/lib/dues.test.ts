import { describe, it, expect } from 'vitest'
import { isOverdue, calculateFeesCollectedThisMonth } from './dues'

describe('isOverdue', () => {
  it('is true when due_date is in the past and status is unpaid', () => {
    expect(isOverdue({ due_date: '2026-07-01', status: 'unpaid' }, new Date('2026-07-15'))).toBe(true)
  })

  it('is false when status is paid, even if due_date is in the past', () => {
    expect(isOverdue({ due_date: '2026-07-01', status: 'paid' }, new Date('2026-07-15'))).toBe(false)
  })

  it('is false when due_date is in the future', () => {
    expect(isOverdue({ due_date: '2026-08-01', status: 'unpaid' }, new Date('2026-07-15'))).toBe(false)
  })
})

describe('calculateFeesCollectedThisMonth', () => {
  it('sums payments made in the same month/year as today', () => {
    const payments = [
      { amount: 14000, paid_at: '2026-07-02T10:00:00Z' },
      { amount: 12000, paid_at: '2026-07-20T10:00:00Z' },
      { amount: 18000, paid_at: '2026-06-15T10:00:00Z' },
    ]
    expect(calculateFeesCollectedThisMonth(payments, new Date('2026-07-25'))).toBe(26000)
  })

  it('returns 0 when there are no payments this month', () => {
    expect(calculateFeesCollectedThisMonth([], new Date('2026-07-25'))).toBe(0)
  })
})
