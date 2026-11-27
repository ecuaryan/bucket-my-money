import { describe, expect, it } from 'vitest'
import {
  EMPTY_PLAN_HISTORY,
  clearPlanUndoHistories,
  keepPlanHistory,
  openPlanHistory,
  recordStep,
  returnStep,
  takeStep,
  type PlanAmount,
} from './planUndo'

const month = (cents: number): PlanAmount => ({ unit: 'month', value: BigInt(cents) })

describe('plan undo history', () => {
  it('steps back and forward through typed changes', () => {
    let h = recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(100), after: month(200) })
    h = recordStep(h, { lineId: 'a', before: month(200), after: month(300) })
    const values = new Map([['a', month(300)]])
    const current = (id: string) => values.get(id) ?? null

    let r = takeStep(h, 'undo', current)
    expect(r.apply?.amount).toEqual(month(200))
    values.set('a', month(200))
    r = takeStep(r.history, 'undo', current)
    expect(r.apply?.amount).toEqual(month(100))
    values.set('a', month(100))
    expect(r.history.past).toHaveLength(0)

    r = takeStep(r.history, 'redo', current)
    expect(r.apply?.amount).toEqual(month(200))
    expect(r.history.future).toHaveLength(1)
  })

  it('a new change clears what could be redone', () => {
    let h = recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(100), after: month(200) })
    h = takeStep(h, 'undo', () => month(200)).history
    expect(h.future).toHaveLength(1)
    h = recordStep(h, { lineId: 'b', before: month(5), after: month(6) })
    expect(h.future).toHaveLength(0)
  })

  it('records nothing for a change that leaves the value as it was', () => {
    expect(recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(1), after: month(1) })).toBe(EMPTY_PLAN_HISTORY)
  })

  it('skips a change someone else has since overwritten, or whose line is gone', () => {
    let h = recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(100), after: month(200) })
    h = recordStep(h, { lineId: 'gone', before: month(1), after: month(2) })
    h = recordStep(h, { lineId: 'b', before: month(10), after: month(20) })
    const values = new Map([['a', month(200)], ['b', month(99)]]) // b changed by someone else
    const r = takeStep(h, 'undo', (id) => values.get(id) ?? null)
    expect(r.apply).toMatchObject({ step: { lineId: 'a' }, amount: month(100) })
    expect(r.history).toEqual({ past: [], future: [{ lineId: 'a', before: month(100), after: month(200) }] })
  })

  it('treats a unit switch as a change', () => {
    const percent: PlanAmount = { unit: 'percent', value: 1000n }
    const h = recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(100), after: percent })
    expect(takeStep(h, 'undo', () => percent).apply?.amount).toEqual(month(100))
    expect(takeStep(h, 'undo', () => ({ unit: 'month', value: 1000n })).apply).toBeNull()
  })

  it('a failed save puts its step back where it was', () => {
    const step = { lineId: 'a', before: month(1), after: month(2) }
    const recorded = recordStep(EMPTY_PLAN_HISTORY, step)
    expect(returnStep(recorded, step, 'record')).toEqual(EMPTY_PLAN_HISTORY)
    const undone = takeStep(recorded, 'undo', () => month(2)).history
    expect(returnStep(undone, step, 'undo')).toEqual({ past: [step], future: [] })
    const redone = takeStep(undone, 'redo', () => month(1)).history
    expect(returnStep(redone, step, 'redo')).toEqual({ past: [], future: [step] })
  })

  it('keeps each person’s history while the app is open, until sign-out', () => {
    const h = recordStep(EMPTY_PLAN_HISTORY, { lineId: 'a', before: month(1), after: month(2) })
    keepPlanHistory('me', h)
    expect(openPlanHistory('me')).toBe(h)
    expect(openPlanHistory('someone else')).toBe(EMPTY_PLAN_HISTORY)
    clearPlanUndoHistories()
    expect(openPlanHistory('me')).toBe(EMPTY_PLAN_HISTORY)
  })

  it('does nothing with nothing to step', () => {
    const r = takeStep(EMPTY_PLAN_HISTORY, 'redo', () => null)
    expect(r.apply).toBeNull()
    expect(r.history).toEqual(EMPTY_PLAN_HISTORY)
  })
})
