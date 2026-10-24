import { describe, expect, it } from 'vitest'
import type {
  MyPartyState,
  PartyBoard,
  PartyLfgEntry,
  PartyPendingItem,
  PartySummary,
  PublicPartyBoard,
} from '@/Features/Party/Party.types'
import { applyPublicBoard, needsPersonalRefetch, parsePartyBoardUpdate } from './partyBoardUpdate'

const ME = 7

const member = (id: number, leader = false) => ({
  id,
  nickname: `M${id}`,
  className: null,
  classImageUrl: null,
  level: 1,
  expPercent: null,
  leader,
})

const party = (id: number, number: number, memberIds: number[], leaderId: number | null): PartySummary => ({
  id,
  number,
  map: 'ELAN',
  spot: 'TC1',
  leaderId,
  members: memberIds.map((m) => member(m, m === leaderId)),
  memberCount: memberIds.length,
})

const lfg = (memberId: number): PartyLfgEntry => ({
  memberId,
  nickname: `M${memberId}`,
  className: null,
  classImageUrl: null,
  level: 1,
  expPercent: null,
  note: null,
  createdAt: '2026-10-18T10:00:00Z',
})

const pending = (id: number, partyId: number): PartyPendingItem => ({
  id,
  kind: 'JOIN_REQUEST',
  partyId,
  partyMap: 'ELAN',
  otherMember: member(99),
  createdAt: '2026-10-18T10:00:00Z',
})

const my = (overrides: Partial<MyPartyState> = {}): MyPartyState => ({
  memberId: ME,
  partyId: null,
  partyNumber: null,
  partyMap: null,
  partySpot: null,
  leader: false,
  canOrganizeParties: false,
  lfg: null,
  pending: [],
  ...overrides,
})

const board = (overrides: Partial<PartyBoard> = {}): PartyBoard => ({
  parties: [],
  lfg: [],
  my: my(),
  serverTime: '2026-10-18T10:00:00Z',
  ...overrides,
})

const publicBoard = (overrides: Partial<PublicPartyBoard> = {}): PublicPartyBoard => ({
  parties: [],
  lfg: [],
  serverTime: '2026-10-18T10:00:05Z',
  ...overrides,
})

describe('applyPublicBoard', () => {
  it('derives my PT, number and leadership from the public parties', () => {
    const next = applyPublicBoard(board(), publicBoard({ parties: [party(3, 2, [1, ME], ME)] }))
    expect(next.my).toMatchObject({ partyId: 3, partyNumber: 2, partyMap: 'ELAN', partySpot: 'TC1', leader: true })
    expect(next.serverTime).toBe('2026-10-18T10:00:05Z')
  })

  it('clears my PT when I was kicked and puts me on the waiting list', () => {
    const old = board({ my: my({ partyId: 3, partyNumber: 1, partyMap: 'ELAN', leader: true }) })
    const next = applyPublicBoard(old, publicBoard({ parties: [party(3, 1, [1], 1)], lfg: [lfg(ME)] }))
    expect(next.my).toMatchObject({ partyId: null, partyNumber: null, leader: false })
    expect(next.my.lfg?.memberId).toBe(ME)
  })

  it('keeps personal fields and drops pending items of PTs that no longer exist', () => {
    const old = board({ my: my({ canOrganizeParties: true, pending: [pending(1, 3), pending(2, 4)] }) })
    const next = applyPublicBoard(old, publicBoard({ parties: [party(3, 1, [1], 1)] }))
    expect(next.my.canOrganizeParties).toBe(true)
    expect(next.my.pending.map((p) => p.id)).toEqual([1])
  })
})

describe('needsPersonalRefetch', () => {
  const update = (pendingMemberIds: number[], joinRequestsChanged = false) => ({
    type: 'BOARD_UPDATED' as const,
    board: publicBoard(),
    pendingMemberIds,
    joinRequestsChanged,
  })

  it('refetches only the members whose pending changed', () => {
    expect(needsPersonalRefetch(board(), update([ME]))).toBe(true)
    expect(needsPersonalRefetch(board(), update([1, 2]))).toBe(false)
  })

  it('refetches organizers when a join request changed', () => {
    const organizer = board({ my: my({ canOrganizeParties: true }) })
    expect(needsPersonalRefetch(organizer, update([1], true))).toBe(true)
    expect(needsPersonalRefetch(board(), update([1], true))).toBe(false)
  })

  it('refetches without a cached board or without a snapshot', () => {
    expect(needsPersonalRefetch(undefined, update([]))).toBe(true)
    expect(needsPersonalRefetch(board(), { ...update([]), board: null })).toBe(true)
  })
})

describe('parsePartyBoardUpdate', () => {
  it('accepts the legacy signal-only message as "refetch"', () => {
    expect(parsePartyBoardUpdate('{"type":"BOARD_UPDATED"}')).toEqual({
      type: 'BOARD_UPDATED',
      board: null,
      pendingMemberIds: [],
      joinRequestsChanged: false,
    })
  })

  it('rejects malformed payloads', () => {
    expect(parsePartyBoardUpdate('nope')).toBeNull()
    expect(parsePartyBoardUpdate('{"type":"OTHER"}')).toBeNull()
  })
})
