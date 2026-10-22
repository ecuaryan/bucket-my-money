import { describe, expect, it } from 'vitest'
import { serviceClient } from './fixtures'

/**
 * Twice-a-month Auto-bucket days are free-form (the editor picks a first day
 * and a second day, 15 later by default) — the server has never been limited
 * to the old presets. Lock that in: any pair fires on exactly those days, and
 * the display label falls back to a plain "5th & 20th".
 */

async function dueDays(days: number[], dates: string[]): Promise<string[]> {
  const svc = serviceClient()
  const due: string[] = []
  for (const date of dates) {
    const { data, error } = await svc.rpc('auto_organize_is_due_on', {
      p_auto_organize_type: 'monthly',
      p_start_date: null,
      p_interval_count: null,
      p_interval_unit: null,
      p_days_of_month: days,
      p_local_date: date,
    })
    expect(error).toBeNull()
    if (data) due.push(date)
  }
  return due
}

describe('twice-a-month with custom days', () => {
  it('fires on exactly the two chosen days', async () => {
    const dates = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-19', '2026-10-20', '2026-10-21']
    expect(await dueDays([5, 20], dates)).toEqual(['2026-10-05', '2026-10-20'])
  })

  it('treats 0 as the real last day of the month (28th in a short February)', async () => {
    expect(
      await dueDays([16, 0], ['2026-02-16', '2026-02-27', '2026-02-28', '2026-03-31', '2026-03-30']),
    ).toEqual(['2026-02-16', '2026-02-28', '2026-03-31'])
  })

  it('labels a custom pair plainly', async () => {
    const svc = serviceClient()
    const { data, error } = await svc.rpc('auto_organize_cadence_summary', {
      p_auto_organize_type: 'monthly',
      p_start_date: null,
      p_interval_count: null,
      p_interval_unit: null,
      p_days_of_month: [5, 20],
    })
    expect(error).toBeNull()
    expect(data).toBe('Twice a month · 5th & 20th')
  })
})
