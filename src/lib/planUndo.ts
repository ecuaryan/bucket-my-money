import type { PlanUnit } from '@/lib/planMath'

/** What a typed number set on a line: its unit and value (cents, or basis points for %). */
export interface PlanAmount {
  unit: PlanUnit
  value: bigint
}

/** One typed number change, so it can be stepped back and forward. */
export interface PlanAmountStep {
  lineId: string
  before: PlanAmount
  after: PlanAmount
}

export interface PlanUndoHistory {
  past: readonly PlanAmountStep[]
  future: readonly PlanAmountStep[]
}

export const EMPTY_PLAN_HISTORY: PlanUndoHistory = { past: [], future: [] }

export function sameAmount(a: PlanAmount, b: PlanAmount): boolean {
  return a.unit === b.unit && a.value === b.value
}

/** A new change starts a new branch: whatever was undone can't be redone. */
export function recordStep(history: PlanUndoHistory, step: PlanAmountStep): PlanUndoHistory {
  if (sameAmount(step.before, step.after)) return history
  return { past: [...history.past, step], future: [] }
}

/**
 * Step back (or forward) one change. A change whose line no longer shows the
 * value it left (someone else changed it, or the line is gone) is dropped and
 * the next one is tried, so an undo never overwrites anyone else's edit.
 */
export function takeStep(
  history: PlanUndoHistory,
  direction: 'undo' | 'redo',
  current: (lineId: string) => PlanAmount | null,
): { history: PlanUndoHistory; apply: { step: PlanAmountStep; amount: PlanAmount } | null } {
  const undo = direction === 'undo'
  const from = [...(undo ? history.past : history.future)]
  const to = undo ? history.future : history.past
  const arrange = (left: PlanAmountStep[], moved: readonly PlanAmountStep[]): PlanUndoHistory =>
    undo ? { past: left, future: moved } : { past: moved, future: left }
  while (from.length > 0) {
    const step = from.pop()!
    const now = current(step.lineId)
    if (now && sameAmount(now, undo ? step.after : step.before)) {
      return {
        history: arrange(from, [...to, step]),
        apply: { step, amount: undo ? step.before : step.after },
      }
    }
  }
  return { history: arrange([], to), apply: null }
}

/**
 * A save that failed puts its step back where it was, so the buttons stay true
 * to what's stored: a typed change that never saved leaves Undo; an undo or
 * redo that never saved can be tapped again.
 */
export function returnStep(
  history: PlanUndoHistory,
  step: PlanAmountStep,
  failed: 'record' | 'undo' | 'redo',
): PlanUndoHistory {
  const past = history.past.filter((s) => s !== step)
  const future = history.future.filter((s) => s !== step)
  if (failed === 'undo') return { past: [...past, step], future }
  if (failed === 'redo') return { past, future: [...future, step] }
  return { past, future }
}

/**
 * Each person's history lives as long as the app is open, like undo in a
 * Google Sheet: moving around the app keeps it; a reload or closing the app
 * starts fresh. Never stored or sent anywhere.
 */
const openHistories = new Map<string, PlanUndoHistory>()

export function openPlanHistory(memberId: string): PlanUndoHistory {
  return openHistories.get(memberId) ?? EMPTY_PLAN_HISTORY
}

export function keepPlanHistory(memberId: string, history: PlanUndoHistory): void {
  openHistories.set(memberId, history)
}

/** On sign-out, like the page caches: the next person starts with nothing to undo. */
export function clearPlanUndoHistories(): void {
  openHistories.clear()
}
