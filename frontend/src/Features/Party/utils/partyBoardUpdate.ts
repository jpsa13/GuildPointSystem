import type { PartyBoard, PartyBoardUpdate, PublicPartyBoard } from '@/Features/Party/Party.types'

/**
 * Applies a broadcast public board to this member's cached board. "My PT" and "my waiting-list entry"
 * are derived from the public data; pending items are kept (only the members involved get a refetch
 * signal), minus those whose PT no longer exists (their rows went with the PT).
 */
export function applyPublicBoard(old: PartyBoard, board: PublicPartyBoard): PartyBoard {
  const me = old.my.memberId
  const party = board.parties.find((p) => p.members.some((m) => m.id === me))
  const partyIds = new Set(board.parties.map((p) => p.id))
  return {
    ...board,
    my: {
      ...old.my,
      partyId: party?.id ?? null,
      partyNumber: party?.number ?? null,
      partyMap: party?.map ?? null,
      partySpot: party?.spot ?? null,
      leader: party != null && party.leaderId === me,
      lfg: board.lfg.find((e) => e.memberId === me) ?? null,
      pending: old.my.pending.filter((p) => partyIds.has(p.partyId)),
    },
  }
}

/** Whether this client must refetch its own board after a broadcast. */
export function needsPersonalRefetch(old: PartyBoard | undefined, update: PartyBoardUpdate): boolean {
  if (!old || !update.board) return true
  if (update.pendingMemberIds?.includes(old.my.memberId)) return true
  return !!update.joinRequestsChanged && old.my.canOrganizeParties
}

export function parsePartyBoardUpdate(body: string): PartyBoardUpdate | null {
  try {
    const parsed = JSON.parse(body) as Partial<PartyBoardUpdate>
    if (parsed?.type !== 'BOARD_UPDATED') return null
    return {
      type: 'BOARD_UPDATED',
      board: parsed.board ?? null,
      pendingMemberIds: parsed.pendingMemberIds ?? [],
      joinRequestsChanged: !!parsed.joinRequestsChanged,
    }
  } catch {
    return null
  }
}
