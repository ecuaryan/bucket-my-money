import type { AutoOrganizeKind } from '@/lib/brand'
import type { AutoOrganizeWithDetails } from '@/lib/autoOrganize'
import {
  monthlyScheduleFromDays,
  normalizeMonthlyCadence,
  type AutoOrganizeCadence,
  type MonthlyMode,
  type TwiceMonthlyDays,
  tomorrowIsoInTimeZone,
} from '@/lib/autoOrganizeCadence'
import type { Database } from '@/types/database'

export type Bucket = Pick<
  Database['public']['Tables']['buckets']['Row'],
  'id' | 'name' | 'allocated_amount'
>

export type BucketDraft = { bucketId: string; amountStr: string }

type EditorSnapshot = {
  kind: AutoOrganizeKind
  name: string
  familyTimezone: string
  cadence: AutoOrganizeCadence
  monthlyMode: MonthlyMode
  twiceDays: TwiceMonthlyDays
  monthlyOnceDay: number
  bucketDrafts: BucketDraft[]
  destinationBucketId: string | null
}

export function defaultCadenceForKind(
  kind: AutoOrganizeKind,
  timeZone: string,
): AutoOrganizeCadence {
  switch (kind) {
    case 'top_up':
      return {
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [1],
      }
    case 'save_off':
      return {
        autoOrganizeType: 'monthly',
        startDate: null,
        intervalCount: null,
        intervalUnit: null,
        daysOfMonth: [0],
      }
    default:
      return {
        autoOrganizeType: 'interval',
        startDate: tomorrowIsoInTimeZone(timeZone),
        intervalCount: 2,
        intervalUnit: 'week',
        daysOfMonth: null,
      }
  }
}

/** Default schedule state for a kind, in the editor's monthly/twice form. */
export function scheduleForKind(kind: AutoOrganizeKind, timeZone: string) {
  const cadence = normalizeMonthlyCadence(defaultCadenceForKind(kind, timeZone))
  const schedule = monthlyScheduleFromDays(cadence.daysOfMonth)
  return {
    cadence,
    monthlyMode: schedule.mode,
    twiceDays: schedule.twice,
    monthlyOnceDay: schedule.onceDay,
  }
}

export function cadenceFromInitial(
  initial: AutoOrganizeWithDetails | null,
  kind: AutoOrganizeKind,
  timeZone: string,
): AutoOrganizeCadence {
  if (!initial) {
    return defaultCadenceForKind(kind, timeZone)
  }
  return {
    autoOrganizeType: initial.auto_organize_type as AutoOrganizeCadence['autoOrganizeType'],
    startDate: initial.start_date,
    intervalCount: initial.interval_count,
    intervalUnit: initial.interval_unit as AutoOrganizeCadence['intervalUnit'],
    daysOfMonth: initial.days_of_month,
  }
}

export function bucketDraftsFromBuckets(
  buckets: Bucket[],
  lines: AutoOrganizeWithDetails['lines'] | undefined,
): BucketDraft[] {
  const amountByBucketId = new Map(
    (lines ?? []).map((line) => [line.bucket_id, String(Number(line.amount))]),
  )
  return buckets.map((bucket) => ({
    bucketId: bucket.id,
    amountStr: amountByBucketId.get(bucket.id) ?? '',
  }))
}

export function snapshotFromState(state: EditorSnapshot): string {
  return JSON.stringify(state)
}

export function buildSnapshot(
  kind: AutoOrganizeKind,
  name: string,
  familyTimezone: string,
  cadence: AutoOrganizeCadence,
  monthlyMode: MonthlyMode,
  twiceDays: TwiceMonthlyDays,
  monthlyOnceDay: number,
  bucketDrafts: BucketDraft[],
  destinationBucketId: string | null,
): EditorSnapshot {
  return {
    kind,
    name,
    familyTimezone,
    cadence,
    monthlyMode,
    twiceDays,
    monthlyOnceDay,
    bucketDrafts,
    destinationBucketId,
  }
}
