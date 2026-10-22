/**
 * Bucket groups: purely visual, per-member sections on the Buckets tab.
 * Pure layout logic lives here (unit-tested); the RPC wrappers sit at the bottom.
 */
import { supabase } from '@/lib/supabase'
import { formatErrorMessage } from '@/lib/errorMessage'
import type { Database } from '@/types/database'

type Bucket = Database['public']['Tables']['buckets']['Row']

export const BUCKET_GROUP_NAME_MAX_LENGTH = 40

/** Section key for the implicit "Ungrouped" section (it has no group_id). */
export const UNGROUPED_KEY = 'ungrouped'

export type BucketGroup = {
  id: string
  name: string | null
  isUngrouped: boolean
  displayOrder: number
}

export type BucketGroupLayout = {
  groups: BucketGroup[]
  /** bucket id → group id (null/missing = Ungrouped). */
  bucketGroupIds: Record<string, string | null>
}

export const EMPTY_GROUP_LAYOUT: BucketGroupLayout = {
  groups: [],
  bucketGroupIds: {},
}

export type BucketSection = {
  /** Real group id, or UNGROUPED_KEY. */
  key: string
  name: string | null
  collapsed: boolean
  isUngrouped: boolean
  buckets: Bucket[]
}

/** Ordered section → bucket ids (the shape the save RPC takes). */
export type LayoutOrder = Array<{ key: string; bucketIds: string[] }>

export function hasRealGroups(layout: BucketGroupLayout): boolean {
  return layout.groups.some((g) => !g.isUngrouped)
}

/**
 * Sections in display order. With no real groups there is exactly one
 * (Ungrouped) section holding every bucket — the list renders as before.
 * `buckets` must already be in the member's display order.
 */
export function buildSections(
  buckets: Bucket[],
  layout: BucketGroupLayout,
  collapsedKeys: ReadonlySet<string> = new Set(),
): BucketSection[] {
  const real = layout.groups
    .filter((g) => !g.isUngrouped)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  const ungroupedRow = layout.groups.find((g) => g.isUngrouped)

  const sections: BucketSection[] = real.map((g) => ({
    key: g.id,
    name: g.name,
    collapsed: collapsedKeys.has(g.id),
    isUngrouped: false,
    buckets: [],
  }))
  const ungrouped: BucketSection = {
    key: UNGROUPED_KEY,
    name: null,
    collapsed: collapsedKeys.has(UNGROUPED_KEY),
    isUngrouped: true,
    buckets: [],
  }

  // Ungrouped sits where its row says; default (no row) is the bottom.
  const position = ungroupedRow
    ? real.filter((g) => g.displayOrder < ungroupedRow.displayOrder).length
    : real.length
  sections.splice(position, 0, ungrouped)

  const byKey = new Map(sections.map((s) => [s.key, s]))
  for (const bucket of buckets) {
    const gid = layout.bucketGroupIds[bucket.id] ?? null
    const section = (gid && byKey.get(gid)) || ungrouped
    section.buckets.push(bucket)
  }
  return sections
}

/** An empty Ungrouped is hidden once groups exist — it would just be a blank heading. */
export function isHiddenSection(
  section: BucketSection,
  grouped: boolean,
): boolean {
  return grouped && section.isUngrouped && section.buckets.length === 0
}

export function sectionTotal(section: BucketSection): number {
  return section.buckets.reduce((sum, b) => sum + Number(b.allocated_amount), 0)
}

export const GROUP_HEADER_PREFIX = 'group:'

export function headerIdForKey(key: string): string {
  return `${GROUP_HEADER_PREFIX}${key}`
}

export function isHeaderId(id: string): boolean {
  return id.startsWith(GROUP_HEADER_PREFIX)
}

export function keyFromHeaderId(id: string): string {
  return id.slice(GROUP_HEADER_PREFIX.length)
}

/**
 * Flat list of what is on screen, top to bottom: header ids and (for expanded
 * sections) bucket ids. Without real groups it is just the bucket ids.
 */
export function visibleRowIds(
  sections: BucketSection[],
  grouped: boolean,
): string[] {
  if (!grouped) return sections.flatMap((s) => s.buckets.map((b) => b.id))
  return sections.flatMap((s) => [
    headerIdForKey(s.key),
    ...(s.collapsed ? [] : s.buckets.map((b) => b.id)),
  ])
}

export type DerivedLayout = {
  order: LayoutOrder
  /** Collapsed sections that received a dropped bucket — expand them. */
  expandKeys: string[]
}

/**
 * Turn the on-screen row order after a drag back into a full layout. A bucket
 * belongs to the nearest header above it; buckets hidden inside collapsed
 * sections stay where they were.
 */
export function layoutFromVisibleOrder(
  sections: BucketSection[],
  visibleIds: string[],
): DerivedLayout {
  const keys: string[] = []
  const lists = new Map<string, string[]>()
  let current: string | null = null

  for (const id of visibleIds) {
    if (isHeaderId(id)) {
      current = keyFromHeaderId(id)
      if (!lists.has(current)) {
        keys.push(current)
        lists.set(current, [])
      }
    } else {
      // A bucket above every header (dropped at the very top) joins the first.
      if (current === null) {
        const firstHeader = visibleIds.find(isHeaderId)
        current = firstHeader ? keyFromHeaderId(firstHeader) : sections[0].key
        keys.push(current)
        lists.set(current, [])
      }
      lists.get(current)!.push(id)
    }
  }
  // Sections not on screen (an empty Ungrouped is hidden) keep their slot.
  sections.forEach((s, index) => {
    if (!lists.has(s.key)) {
      keys.splice(Math.min(index, keys.length), 0, s.key)
      lists.set(s.key, [])
    }
  })

  const expandKeys: string[] = []
  const order: LayoutOrder = keys.map((key) => {
    const section = sections.find((s) => s.key === key)
    const visible = lists.get(key)!
    if (section?.collapsed) {
      if (visible.length > 0) expandKeys.push(key)
      // Hidden buckets stay put; any dropped ones come first (they were just placed).
      return {
        key,
        bucketIds: [...visible, ...section.buckets.map((b) => b.id)],
      }
    }
    return { key, bucketIds: visible }
  })
  return { order, expandKeys }
}

/** Current layout as an order (for no-op detection and group moves). */
export function orderFromSections(sections: BucketSection[]): LayoutOrder {
  return sections.map((s) => ({ key: s.key, bucketIds: s.buckets.map((b) => b.id) }))
}

/** Reorder whole sections (group drag / Move up / Move down). */
export function moveSection(
  order: LayoutOrder,
  key: string,
  to: number | 'up' | 'down',
): LayoutOrder {
  const from = order.findIndex((o) => o.key === key)
  if (from < 0) return order
  const target = to === 'up' ? from - 1 : to === 'down' ? from + 1 : to
  if (target < 0 || target >= order.length || target === from) return order
  const next = [...order]
  const [item] = next.splice(from, 1)
  next.splice(target, 0, item)
  return next
}

/** Section order after dragging a header over another header (collapsed-headers drag). */
export function moveSectionByHeaders(
  order: LayoutOrder,
  activeHeaderId: string,
  overHeaderId: string,
): LayoutOrder {
  const to = order.findIndex((o) => o.key === keyFromHeaderId(overHeaderId))
  if (to < 0) return order
  return moveSection(order, keyFromHeaderId(activeHeaderId), to)
}

export function sameOrder(a: LayoutOrder, b: LayoutOrder): boolean {
  if (a.length !== b.length) return false
  return a.every(
    (s, i) =>
      s.key === b[i].key &&
      s.bucketIds.length === b[i].bucketIds.length &&
      s.bucketIds.every((id, j) => id === b[i].bucketIds[j]),
  )
}

/** Apply a new layout order locally (optimistic update before the RPC returns). */
export function applyLayoutOrder(
  buckets: Bucket[],
  layout: BucketGroupLayout,
  order: LayoutOrder,
): { buckets: Bucket[]; layout: BucketGroupLayout } {
  const byId = new Map(buckets.map((b) => [b.id, b]))
  const nextBuckets: Bucket[] = []
  const bucketGroupIds: Record<string, string | null> = {}

  order.forEach((entry) => {
    const gid = entry.key === UNGROUPED_KEY ? null : entry.key
    for (const id of entry.bucketIds) {
      const bucket = byId.get(id)
      if (!bucket) continue
      nextBuckets.push(bucket)
      bucketGroupIds[id] = gid
    }
  })

  const groups = layout.groups.map((g) => {
    const idx = order.findIndex((o) =>
      g.isUngrouped ? o.key === UNGROUPED_KEY : o.key === g.id,
    )
    return idx >= 0 ? { ...g, displayOrder: idx + 1 } : g
  })
  return {
    buckets: nextBuckets.length === buckets.length ? nextBuckets : buckets,
    layout: { groups, bucketGroupIds },
  }
}

export function normalizeGroupName(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

// ---------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------

/** Load this member's groups + bucket→group map. Missing tables/RPC → no groups. */
export async function fetchBucketGroupLayout(): Promise<BucketGroupLayout> {
  const [groupsRes, orderRes] = await Promise.all([
    supabase
      .from('member_bucket_groups')
      .select('id, name, is_ungrouped, display_order'),
    supabase.from('member_bucket_order').select('bucket_id, group_id'),
  ])
  if (groupsRes.error || orderRes.error) {
    // Migration not deployed yet (deploy window) — render the plain list.
    return EMPTY_GROUP_LAYOUT
  }
  const bucketGroupIds: Record<string, string | null> = {}
  for (const row of orderRes.data ?? []) {
    bucketGroupIds[row.bucket_id] = row.group_id
  }
  return {
    groups: (groupsRes.data ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      isUngrouped: g.is_ungrouped,
      displayOrder: g.display_order,
    })),
    bucketGroupIds,
  }
}

export async function createBucketGroup(name: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('create_bucket_group', {
    p_name: name ?? '',
  })
  if (error) throw new Error(formatErrorMessage(error, 'Could not create group.'))
  return data as string
}

export async function renameBucketGroup(
  groupId: string,
  name: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('rename_bucket_group', {
    p_group_id: groupId,
    p_name: name ?? '',
  })
  if (error) throw new Error(formatErrorMessage(error, 'Could not rename group.'))
}

export async function deleteBucketGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bucket_group', {
    p_group_id: groupId,
  })
  if (error) throw new Error(formatErrorMessage(error, 'Could not delete group.'))
}

export async function saveBucketLayout(order: LayoutOrder): Promise<void> {
  const { error } = await supabase.rpc('save_bucket_layout', {
    p_layout: order.map((o) => ({
      group_id: o.key === UNGROUPED_KEY ? null : o.key,
      bucket_ids: o.bucketIds,
    })),
  })
  if (error) throw new Error(formatErrorMessage(error, 'Could not save order.'))
}
