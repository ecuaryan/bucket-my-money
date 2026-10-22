import { describe, expect, it } from 'vitest'
import {
  AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS,
  AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY,
  applyFrequencySelection,
  daysOfMonthFromSchedule,
  formatCadenceSummary,
  formatEditorNextRunSummary,
  formatEditorSaveScheduleSummary,
  formatLastRunLabel,
  formatRunTimeInTimeZone,
  autoOrganizeRunNowLastRunContext,
  formatLocalDateLabel,
  formatShortIsoDateLabel,
  formatNextRunLabelForCadence,
  formatRunScheduleForDays,
  computeNextRunOn,
  frequencySelectionFromCadence,
  isManualFrequencySelection,
  monthlyScheduleFromDays,
  normalizeMonthlyCadence,
  normalizeOnceMonthlyDay,
  defaultSecondDay,
  formatTwiceMonthlyHint,
  normalizeTwiceDays,
  twiceDaysAfterFirstChange,
  twiceFirstDayOptions,
  twiceSecondDayOptions,
  validateIntervalStartDate,
  maxIntervalStartDateIso,
} from '@/lib/autoOrganizeCadence'

describe('normalizeOnceMonthlyDay', () => {
  it('keeps 1–28 and last day', () => {
    expect(normalizeOnceMonthlyDay(1)).toBe(1)
    expect(normalizeOnceMonthlyDay(28)).toBe(28)
    expect(normalizeOnceMonthlyDay(0)).toBe(0)
  })

  it('maps 29–31 to last day', () => {
    expect(normalizeOnceMonthlyDay(29)).toBe(0)
    expect(normalizeOnceMonthlyDay(30)).toBe(0)
    expect(normalizeOnceMonthlyDay(31)).toBe(0)
  })
})

describe('AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS', () => {
  it('offers 1–28 plus last day only', () => {
    expect(AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS).toHaveLength(
      AUTO_ORGANIZE_ONCE_MONTHLY_MAX_DAY + 1,
    )
    expect(AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS.at(-1)).toEqual({
      value: 0,
      label: 'Last day of month',
    })
    expect(
      AUTO_ORGANIZE_ONCE_MONTHLY_DAY_OPTIONS.some((option) => option.value > 28),
    ).toBe(false)
  })
})

describe('twice-a-month days', () => {
  it('defaults the second day to 15 days after the first', () => {
    expect(defaultSecondDay(1)).toBe(16)
    expect(defaultSecondDay(5)).toBe(20)
    expect(defaultSecondDay(7)).toBe(22)
    expect(defaultSecondDay(13)).toBe(28)
  })

  it('turns past-the-28th into the last day (29–31 are never offered)', () => {
    expect(defaultSecondDay(14)).toBe(0)
    expect(defaultSecondDay(15)).toBe(0)
    expect(defaultSecondDay(16)).toBe(0)
  })

  it('reproduces the former presets that are 15 days apart', () => {
    expect(defaultSecondDay(1)).toBe(16) // 1st & 16th
    expect(defaultSecondDay(7)).toBe(22) // 7th & 22nd
    expect(defaultSecondDay(15)).toBe(0) // 15th & last day
    expect(defaultSecondDay(16)).toBe(0) // 16th & last day
  })

  it('offers 1st–16th for the first day (plus a saved value outside that)', () => {
    expect(twiceFirstDayOptions().map((o) => o.value)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    )
    expect(twiceFirstDayOptions(20).map((o) => o.value).at(-1)).toBe(20)
  })

  it('offers every later day through the 28th, then the last day, for the second', () => {
    const options = twiceSecondDayOptions(26)
    expect(options.map((o) => o.value)).toEqual([27, 28, 0])
    expect(options.at(-1)?.label).toBe('Last day of month')
  })

  it('moves the second day with the first until the user picks their own', () => {
    // Following: 7th & 22nd → move first to the 5th → 5th & 20th.
    expect(twiceDaysAfterFirstChange({ first: 7, second: 22 }, 5)).toEqual({
      first: 5,
      second: 20,
    })
    // Not following (1st & 15th is 14 apart): the chosen second day stays.
    expect(twiceDaysAfterFirstChange({ first: 1, second: 15 }, 3)).toEqual({
      first: 3,
      second: 15,
    })
    // …unless it would no longer come after the first day.
    expect(twiceDaysAfterFirstChange({ first: 1, second: 5 }, 8)).toEqual({
      first: 8,
      second: 23,
    })
  })

  it('normalizes a pair: first before second, last day is latest', () => {
    expect(normalizeTwiceDays({ first: 7, second: 22 })).toEqual({ first: 7, second: 22 })
    expect(normalizeTwiceDays({ first: 16, second: 0 })).toEqual({ first: 16, second: 0 })
    expect(normalizeTwiceDays({ first: 10, second: 10 })).toEqual({ first: 10, second: 25 })
    expect(normalizeTwiceDays({ first: 20, second: 31 })).toEqual({ first: 20, second: 0 })
  })

  it('writes a plain-language hint', () => {
    expect(formatTwiceMonthlyHint({ first: 7, second: 22 })).toBe(
      'Runs on the 7th and the 22nd of every month.',
    )
    expect(formatTwiceMonthlyHint({ first: 16, second: 0 })).toBe(
      'Runs on the 16th and the last day of every month.',
    )
  })
})

describe('monthlyScheduleFromDays', () => {
  it('loads legacy day 31 as once-a-month last day', () => {
    expect(monthlyScheduleFromDays([31])).toMatchObject({ mode: 'once', onceDay: 0 })
  })

  it('loads any saved pair back as first/second day — including the old presets', () => {
    expect(monthlyScheduleFromDays([2, 16]).twice).toEqual({ first: 2, second: 16 })
    expect(monthlyScheduleFromDays([7, 22])).toMatchObject({
      mode: 'twice',
      twice: { first: 7, second: 22 },
    })
    expect(monthlyScheduleFromDays([15, 0]).twice).toEqual({ first: 15, second: 0 })
    // Order in the database doesn't matter; the last day (0) sorts last.
    expect(monthlyScheduleFromDays([0, 16]).twice).toEqual({ first: 16, second: 0 })
    // A custom pair is kept, not reset to 1st & 15th.
    expect(monthlyScheduleFromDays([5, 20]).twice).toEqual({ first: 5, second: 20 })
  })

  it('defaults to twice a month, 1st & 16th, when nothing is saved', () => {
    expect(monthlyScheduleFromDays(null)).toMatchObject({
      mode: 'twice',
      twice: { first: 1, second: 16 },
    })
  })
})

describe('daysOfMonthFromSchedule', () => {
  it('persists normalized once-a-month days', () => {
    expect(daysOfMonthFromSchedule('once', 31, { first: 1, second: 16 })).toEqual([0])
    expect(daysOfMonthFromSchedule('once', 15, { first: 1, second: 16 })).toEqual([15])
  })

  it('persists the chosen twice-monthly pair (any pair, not just presets)', () => {
    expect(daysOfMonthFromSchedule('twice', 1, { first: 5, second: 20 })).toEqual([5, 20])
    expect(daysOfMonthFromSchedule('twice', 1, { first: 16, second: 0 })).toEqual([16, 0])
  })
})

describe('normalizeMonthlyCadence', () => {
  it('rewrites legacy once-a-month day 31 to last day', () => {
    expect(
      normalizeMonthlyCadence({
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [31],
      }).daysOfMonth,
    ).toEqual([0])
  })

  it('leaves twice-monthly presets unchanged', () => {
    const cadence = {
      autoOrganizeType: 'monthly' as const,
      startDate: null,
      intervalCount: null,
      intervalUnit: null,
      daysOfMonth: [1, 15],
    }
    expect(normalizeMonthlyCadence(cadence)).toEqual(cadence)
  })
})

describe('formatRunScheduleForDays', () => {
  it('describes twice-monthly calendar days', () => {
    expect(formatRunScheduleForDays([1, 15])).toBe(
      'Runs on the 1st and the 15th of each month.',
    )
    expect(formatRunScheduleForDays([15, 0])).toBe(
      'Runs on the 15th and the last day of each month.',
    )
  })
})

describe('validateIntervalStartDate', () => {
  const from = new Date('2026-06-11T20:00:00Z')
  const timeZone = 'America/Los_Angeles'

  it('allows tomorrow and later', () => {
    expect(
      validateIntervalStartDate('2026-06-12', timeZone, { from }).ok,
    ).toBe(true)
    expect(
      validateIntervalStartDate('2026-07-01', timeZone, { from }).ok,
    ).toBe(true)
  })

  it('rejects today and past dates', () => {
    expect(validateIntervalStartDate('2026-06-11', timeZone, { from })).toEqual({
      ok: false,
      reason: 'today',
    })
    expect(validateIntervalStartDate('2026-06-01', timeZone, { from })).toEqual({
      ok: false,
      reason: 'past',
    })
  })

  it('allows an unchanged legacy start date when editing', () => {
    expect(
      validateIntervalStartDate('2026-05-01', timeZone, {
        from,
        legacyStartDate: '2026-05-01',
      }).ok,
    ).toBe(true)
    expect(
      validateIntervalStartDate('2026-05-01', timeZone, {
        from,
        legacyStartDate: '2026-06-12',
      }),
    ).toEqual({ ok: false, reason: 'past' })
  })

  it('rejects dates more than two years out', () => {
    const max = maxIntervalStartDateIso(timeZone, from)
    expect(validateIntervalStartDate(max, timeZone, { from }).ok).toBe(true)
    expect(
      validateIntervalStartDate('2028-06-13', timeZone, { from }),
    ).toEqual({ ok: false, reason: 'too_far' })
  })
})

describe('formatLastRunLabel', () => {
  it('formats a completed run date', () => {
    expect(formatLastRunLabel('2026-06-13')).toBe('Last run Jun 13')
  })

  it('returns null when there is no run', () => {
    expect(formatLastRunLabel(null)).toBeNull()
  })
})

describe('formatRunTimeInTimeZone', () => {
  it('formats run time in the family timezone', () => {
    expect(
      formatRunTimeInTimeZone('2026-06-20T19:45:00Z', 'America/Los_Angeles'),
    ).toBe('12:45 PM')
  })
})

describe('autoOrganizeRunNowLastRunContext', () => {
  const lastRun = {
    run_on: '2026-06-20',
    created_at: '2026-06-20T19:45:00Z',
  }

  it('emphasizes when the last run was today', () => {
    const from = new Date('2026-06-20T22:00:00Z')
    expect(
      autoOrganizeRunNowLastRunContext(lastRun, 'America/Los_Angeles', from),
    ).toEqual({
      message: 'Last run today at 12:45 PM.',
      emphasize: true,
    })
  })

  it('uses neutral copy for an older last run', () => {
    const from = new Date('2026-06-21T22:00:00Z')
    expect(
      autoOrganizeRunNowLastRunContext(lastRun, 'America/Los_Angeles', from),
    ).toEqual({
      message: 'Last run Jun 20 at 12:45 PM',
      emphasize: false,
    })
  })
})

describe('formatEditorNextRunSummary', () => {
  it('returns the next due date without repeating cadence', () => {
    const from = new Date('2026-06-11T20:00:00Z')
    expect(
      formatEditorNextRunSummary(
        {
          autoOrganizeType: 'interval',
          startDate: '2026-06-12',
          intervalCount: 2,
          intervalUnit: 'week',
          daysOfMonth: null,
        },
        'America/Los_Angeles',
        from,
      ),
    ).toBe('Jun 12')
  })
})

describe('formatEditorSaveScheduleSummary', () => {
  it('includes cadence and next run for monthly schedules', () => {
    const summary = formatEditorSaveScheduleSummary(
      {
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [1, 15],
      },
      'UTC',
    )
    expect(summary).toMatch(/^Twice a month · 1st & 15th · Next run /)
  })
})

describe('computeNextRunOn', () => {
  it('returns the start date for a weekly interval (matches editor summary)', () => {
    const cadence = {
      autoOrganizeType: 'interval' as const,
      startDate: '2026-06-12',
      intervalCount: 1,
      intervalUnit: 'week' as const,
      daysOfMonth: null,
    }
    const from = new Date('2026-06-11T20:00:00Z')
    expect(computeNextRunOn(cadence, 'America/Los_Angeles', from)).toBe(
      '2026-06-12',
    )
    expect(formatNextRunLabelForCadence(cadence, computeNextRunOn(cadence, 'America/Los_Angeles', from))).toBe(
      'Next run Jun 12',
    )
  })

  it('returns Runs when you choose for manual cadence', () => {
    expect(
      formatNextRunLabelForCadence(
        {
          autoOrganizeType: 'manual',
          startDate: null,
          intervalCount: null,
          intervalUnit: null,
          daysOfMonth: null,
        },
        null,
      ),
    ).toBe('Runs when you choose')
  })

  it('returns null next run for manual cadence', () => {
    expect(
      computeNextRunOn(
        {
          autoOrganizeType: 'manual',
          startDate: null,
          intervalCount: null,
          intervalUnit: null,
          daysOfMonth: null,
        },
        'America/Los_Angeles',
      ),
    ).toBeNull()
  })

  it('skips due dates that already have a run (monthly on the 24th)', () => {
    const cadence = {
      autoOrganizeType: 'monthly' as const,
      startDate: null,
      intervalCount: null,
      intervalUnit: null,
      daysOfMonth: [24],
    }
    const from = new Date('2026-06-24T12:00:00Z')
    expect(
      computeNextRunOn(cadence, 'America/Los_Angeles', from, {
        skipRunOnDates: ['2026-06-24'],
      }),
    ).toBe('2026-07-24')
    expect(
      formatNextRunLabelForCadence(
        cadence,
        computeNextRunOn(cadence, 'America/Los_Angeles', from, {
          skipRunOnDates: ['2026-06-24'],
        }),
      ),
    ).toBe('Next run Jul 24')
  })

  it('skips due dates that already have a run (weekly interval)', () => {
    const cadence = {
      autoOrganizeType: 'interval' as const,
      startDate: '2026-06-12',
      intervalCount: 1,
      intervalUnit: 'week' as const,
      daysOfMonth: null,
    }
    const from = new Date('2026-06-12T12:00:00Z')
    expect(
      computeNextRunOn(cadence, 'America/Los_Angeles', from, {
        skipRunOnDates: ['2026-06-12'],
      }),
    ).toBe('2026-06-19')
  })
})

describe('formatLocalDateLabel', () => {
  it('formats ISO dates in local calendar terms', () => {
    expect(formatLocalDateLabel('2026-06-12')).toBe('Friday, June 12, 2026')
  })
})

describe('formatShortIsoDateLabel', () => {
  it('formats ISO dates for read-only start display', () => {
    expect(formatShortIsoDateLabel('2026-06-13')).toBe('Jun 13, 2026')
  })
})

describe('formatCadenceSummary', () => {
  it('returns Manual only for manual cadence', () => {
    expect(
      formatCadenceSummary({
        autoOrganizeType: 'manual',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: null,
      }),
    ).toBe('Manual only')
  })

  it('describes twice-monthly presets by label', () => {
    expect(
      formatCadenceSummary({
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [2, 16],
      }),
    ).toBe('Twice a month · 2nd & 16th')
  })

  it('describes legacy day 31 as last day', () => {
    expect(
      formatCadenceSummary({
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [31],
      }),
    ).toBe('Once a month · last day')
  })
})

describe('frequencySelectionFromCadence', () => {
  it('maps manual cadence to manual-only', () => {
    expect(
      frequencySelectionFromCadence(
        {
          autoOrganizeType: 'manual',
          startDate: null,
          intervalCount: null,
          intervalUnit: null,
          daysOfMonth: null,
        },
        'twice',
      ),
    ).toBe('manual-only')
  })

  it('maps interval and monthly cadences to flat frequency options', () => {
    expect(
      frequencySelectionFromCadence(
        {
          autoOrganizeType: 'interval',
          startDate: '2026-06-11',
          intervalCount: 2,
          intervalUnit: 'week',
          daysOfMonth: null,
        },
        'twice',
      ),
    ).toBe('2-week')

    expect(
      frequencySelectionFromCadence(
        {
          autoOrganizeType: 'monthly',
          startDate: null,
          intervalCount: null,
          intervalUnit: null,
          daysOfMonth: [15],
        },
        'once',
      ),
    ).toBe('monthly-once')
  })
})

describe('applyFrequencySelection', () => {
  it('clears schedule fields for manual-only', () => {
    const base = {
      autoOrganizeType: 'interval' as const,
      startDate: '2026-06-11',
      intervalCount: 2,
      intervalUnit: 'week' as const,
      daysOfMonth: null,
    }

    expect(
      applyFrequencySelection(
        'manual-only',
        base,
        'twice',
        '2026-06-11',
      ),
    ).toEqual({
      cadence: {
        autoOrganizeType: 'manual',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: null,
      },
      monthlyMode: 'twice',
    })
  })

  it('sets interval cadence from every 2 weeks', () => {
    const base = {
      autoOrganizeType: 'monthly' as const,
      startDate: null,
      intervalCount: null,
      intervalUnit: null,
      daysOfMonth: [1, 15],
    }

    expect(
      applyFrequencySelection(
        '2-week',
        base,
        'twice',
        '2026-06-11',
      ),
    ).toEqual({
      cadence: {
        autoOrganizeType: 'interval',
        startDate: '2026-06-11',
        intervalCount: 2,
        intervalUnit: 'week',
        daysOfMonth: [1, 15],
      },
      monthlyMode: 'twice',
    })
  })
})

describe('isManualFrequencySelection', () => {
  it('identifies manual-only selection', () => {
    expect(isManualFrequencySelection('manual-only')).toBe(true)
    expect(isManualFrequencySelection('2-week')).toBe(false)
    expect(isManualFrequencySelection('monthly-once')).toBe(false)
  })
})
