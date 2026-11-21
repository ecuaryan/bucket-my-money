import { FLOAT_LABEL } from '@/lib/brand'

/** Label for one endpoint of a bucket_move row in History. */
export function bucketEndpointLabel(args: {
  bucketId: string | null
  snapshotName: string | null | undefined
  joinedName: string | null | undefined
}): string {
  if (args.snapshotName) return args.snapshotName
  if (args.joinedName) return args.joinedName
  if (args.bucketId) return 'Bucket'
  return FLOAT_LABEL
}

/** Label for one endpoint of a give row in History. */
export function giveMemberEndpointLabel(args: {
  snapshotName: string | null | undefined
  joinedName: string | null | undefined
  isMe: boolean
}): string {
  if (args.isMe) return 'You'
  if (args.snapshotName) return args.snapshotName
  if (args.joinedName) return args.joinedName
  return 'Someone'
}

/** Who performed a bucket move, for shared-balance History subtitles (admin + Shared). */
export function historyMoveActorLabel(args: {
  actorMemberId: string | null | undefined
  actorName: string | null | undefined
  currentMemberId: string
  showActor: boolean
}): string | null {
  if (!args.showActor || !args.actorMemberId) return null
  if (args.actorMemberId === args.currentMemberId) return 'You'
  if (args.actorName) return args.actorName
  return 'Someone'
}

/** Adults see move actors; children do not. */
export function historyShowBucketMoveActor(viewerRole: string): boolean {
  return viewerRole === 'admin' || viewerRole === 'member'
}

/** Adults see all give actors; children see who gave/took on their own rows. */
export function historyShowGiveActor(args: {
  viewerRole: string
  currentMemberId: string
  row: {
    type: string
    from_member_id: string | null
    to_member_id: string | null
  }
}): boolean {
  if (args.viewerRole === 'admin' || args.viewerRole === 'member') return true
  if (args.row.type !== 'give') return false
  return (
    args.row.from_member_id === args.currentMemberId ||
    args.row.to_member_id === args.currentMemberId
  )
}

function historyTxSubtitle(args: {
  kind: 'Bucket move' | 'Give' | 'Take'
  time: string
  actorMemberId: string | null | undefined
  actorName: string | null | undefined
  currentMemberId: string
  showActor: boolean
}): string {
  const actor = historyMoveActorLabel(args)
  if (actor) return `${args.kind} · ${actor} · ${args.time}`
  return `${args.kind} · ${args.time}`
}

export function historyBucketMoveSubtitle(args: {
  time: string
  actorMemberId: string | null | undefined
  actorName: string | null | undefined
  currentMemberId: string
  showActor: boolean
  autoOrganizeRunTrigger?: string | null
}): string {
  if (args.autoOrganizeRunTrigger === 'scheduled') {
    return `Bucket move · Scheduled · ${args.time}`
  }
  return historyTxSubtitle({ ...args, kind: 'Bucket move' })
}

export function historyGiveSubtitle(args: {
  time: string
  actorMemberId: string | null | undefined
  actorName: string | null | undefined
  currentMemberId: string
  showActor: boolean
}): string {
  return historyTxSubtitle({ ...args, kind: 'Give' })
}

/** Parent took unallocated money from a virtual kid (return_from_child). */
export function historyTakeSubtitle(args: {
  time: string
  actorMemberId: string | null | undefined
  actorName: string | null | undefined
  currentMemberId: string
  showActor: boolean
}): string {
  return historyTxSubtitle({ ...args, kind: 'Take' })
}

export function isParentTakeFromChild(row: {
  type: string
  from_member_id: string | null
  initiated_by_member_id?: string | null
}): boolean {
  return (
    row.type === 'give' &&
    row.initiated_by_member_id != null &&
    row.initiated_by_member_id !== row.from_member_id
  )
}

export function historyGiveActor(args: {
  row: {
    type: string
    from_member_id: string | null
    from_member_name: string | null | undefined
    initiated_by_member_id?: string | null
    initiated_by_member_name?: string | null
    from_member?: { name: string } | null
  }
}): { actorMemberId: string | null; actorName: string | null | undefined } {
  if (isParentTakeFromChild(args.row)) {
    return {
      actorMemberId: args.row.initiated_by_member_id ?? null,
      actorName: args.row.initiated_by_member_name ?? null,
    }
  }
  return {
    actorMemberId: args.row.from_member_id,
    actorName: args.row.from_member_name ?? args.row.from_member?.name,
  }
}
