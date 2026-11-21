import { describe, expect, it } from 'vitest'
import { FLOAT_LABEL } from '@/lib/brand'
import {
  bucketEndpointLabel,
  historyBucketMoveSubtitle,
  historyGiveActor,
  historyGiveSubtitle,
  historyTakeSubtitle,
  historyMoveActorLabel,
  historyShowGiveActor,
  giveMemberEndpointLabel,
} from '@/lib/historyLabels'

describe('bucketEndpointLabel', () => {
  it('prefers snapshot name over live join', () => {
    expect(
      bucketEndpointLabel({
        bucketId: 'b1',
        snapshotName: 'Old name',
        joinedName: 'New name',
      }),
    ).toBe('Old name')
  })

  it('uses live join when no snapshot', () => {
    expect(
      bucketEndpointLabel({
        bucketId: 'b1',
        snapshotName: null,
        joinedName: 'Groceries',
      }),
    ).toBe('Groceries')
  })

  it('shows the unallocated label for null bucket id without snapshot', () => {
    expect(
      bucketEndpointLabel({
        bucketId: null,
        snapshotName: null,
        joinedName: null,
      }),
    ).toBe(FLOAT_LABEL)
  })

  it('keeps bucket name after delete via snapshot', () => {
    expect(
      bucketEndpointLabel({
        bucketId: null,
        snapshotName: 'Groceries',
        joinedName: null,
      }),
    ).toBe('Groceries')
  })
})

describe('giveMemberEndpointLabel', () => {
  it('prefers snapshot name over live join', () => {
    expect(
      giveMemberEndpointLabel({
        snapshotName: 'Alex',
        joinedName: 'New name',
        isMe: false,
      }),
    ).toBe('Alex')
  })

  it('returns You for the current member', () => {
    expect(
      giveMemberEndpointLabel({
        snapshotName: 'Jamie',
        joinedName: 'Jamie',
        isMe: true,
      }),
    ).toBe('You')
  })

  it('keeps name after member removed via snapshot', () => {
    expect(
      giveMemberEndpointLabel({
        snapshotName: 'Alex',
        joinedName: null,
        isMe: false,
      }),
    ).toBe('Alex')
  })

  it('falls back to Someone without snapshot or join', () => {
    expect(
      giveMemberEndpointLabel({
        snapshotName: null,
        joinedName: null,
        isMe: false,
      }),
    ).toBe('Someone')
  })
})

describe('historyMoveActorLabel', () => {
  it('returns You for the current member', () => {
    expect(
      historyMoveActorLabel({
        actorMemberId: 'm1',
        actorName: 'Jamie',
        currentMemberId: 'm1',
        showActor: true,
      }),
    ).toBe('You')
  })

  it('returns the actor name for another adult', () => {
    expect(
      historyMoveActorLabel({
        actorMemberId: 'm2',
        actorName: 'Ryan',
        currentMemberId: 'm1',
        showActor: true,
      }),
    ).toBe('Ryan')
  })

  it('is hidden for child viewers', () => {
    expect(
      historyMoveActorLabel({
        actorMemberId: 'm2',
        actorName: 'Ryan',
        currentMemberId: 'm1',
        showActor: false,
      }),
    ).toBeNull()
  })
})

describe('historyBucketMoveSubtitle', () => {
  it('includes actor for adults', () => {
    expect(
      historyBucketMoveSubtitle({
        time: '3:45 PM',
        actorMemberId: 'm2',
        actorName: 'Jamie',
        currentMemberId: 'm1',
        showActor: true,
      }),
    ).toBe('Bucket move · Jamie · 3:45 PM')
  })

  it('omits actor when not shown', () => {
    expect(
      historyBucketMoveSubtitle({
        time: '3:45 PM',
        actorMemberId: 'm2',
        actorName: 'Jamie',
        currentMemberId: 'c1',
        showActor: false,
      }),
    ).toBe('Bucket move · 3:45 PM')
  })
})

describe('historyShowGiveActor', () => {
  it('is always on for adults', () => {
    expect(
      historyShowGiveActor({
        viewerRole: 'admin',
        currentMemberId: 'kid',
        row: { type: 'give', from_member_id: 'dad', to_member_id: 'kid' },
      }),
    ).toBe(true)
  })

  it('is on for a child on their own send rows', () => {
    expect(
      historyShowGiveActor({
        viewerRole: 'child',
        currentMemberId: 'kid',
        row: { type: 'give', from_member_id: 'dad', to_member_id: 'kid' },
      }),
    ).toBe(true)
    expect(
      historyShowGiveActor({
        viewerRole: 'child',
        currentMemberId: 'kid',
        row: { type: 'give', from_member_id: 'kid', to_member_id: 'dad' },
      }),
    ).toBe(true)
  })

  it('is off for a child on bucket moves', () => {
    expect(
      historyShowGiveActor({
        viewerRole: 'child',
        currentMemberId: 'kid',
        row: { type: 'bucket_move', from_member_id: 'dad', to_member_id: null },
      }),
    ).toBe(false)
  })
})

describe('historyGiveSubtitle', () => {
  it('includes sender for adults', () => {
    expect(
      historyGiveSubtitle({
        time: '3:45 PM',
        actorMemberId: 'm1',
        actorName: 'Ryan',
        currentMemberId: 'm2',
        showActor: true,
      }),
    ).toBe('Give · Ryan · 3:45 PM')
  })

  it('uses "you" when the viewer sent', () => {
    expect(
      historyGiveSubtitle({
        time: '9:00 AM',
        actorMemberId: 'm1',
        actorName: 'Ryan',
        currentMemberId: 'm1',
        showActor: true,
      }),
    ).toBe('Give · You · 9:00 AM')
  })
})

describe('historyTakeSubtitle', () => {
  it('labels parent-initiated takes', () => {
    expect(
      historyTakeSubtitle({
        time: '3:45 PM',
        actorMemberId: 'm1',
        actorName: 'Ryan',
        currentMemberId: 'm2',
        showActor: true,
      }),
    ).toBe('Take · Ryan · 3:45 PM')
  })

  it('shows parent name to the child who was taken from', () => {
    expect(
      historyTakeSubtitle({
        time: '3:45 PM',
        actorMemberId: 'dad',
        actorName: 'R',
        currentMemberId: 'kid',
        showActor: true,
      }),
    ).toBe('Take · R · 3:45 PM')
  })
})

describe('historyGiveActor', () => {
  it('uses initiator for parent takes', () => {
    expect(
      historyGiveActor({
        row: {
          type: 'give',
          from_member_id: 'kid',
          from_member_name: 'Jake',
          initiated_by_member_id: 'dad',
          initiated_by_member_name: 'Ryan',
        },
      }),
    ).toEqual({ actorMemberId: 'dad', actorName: 'Ryan' })
  })

  it('uses sender for normal sends', () => {
    expect(
      historyGiveActor({
        row: {
          type: 'give',
          from_member_id: 'dad',
          from_member_name: 'Ryan',
          initiated_by_member_id: null,
          initiated_by_member_name: null,
        },
      }),
    ).toEqual({ actorMemberId: 'dad', actorName: 'Ryan' })
  })
})
