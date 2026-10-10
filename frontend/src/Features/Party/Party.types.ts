export type PartyMap = 'ETHER' | 'CAULDRON' | 'ELAN' | 'MB' | 'OC' | 'SEM_MAPA'



export const PARTY_MAP_OPTIONS: { value: PartyMap; label: string }[] = [

  { value: 'ETHER', label: 'Ether' },

  { value: 'CAULDRON', label: 'Cauldron' },

  { value: 'ELAN', label: 'Elan' },

  { value: 'MB', label: 'MB' },

  { value: 'OC', label: 'OC' },

  { value: 'SEM_MAPA', label: 'S/Mapa Definido' },

]

export function partyMapHasSpot(map: PartyMap): boolean {
  return map !== 'SEM_MAPA'
}

export const PARTY_SPOT_PLACEHOLDER: Record<Exclude<PartyMap, 'SEM_MAPA'>, string> = {
  ETHER: 'Ex.: White Hole, Lures Lot, Jacks Lot',
  CAULDRON: 'Ex.: Cave 1, Z, Tapete, Lago',
  ELAN: 'Ex.: TC1, Cachoeira, Fabrica, ABX, Devas',
  MB: 'Ex.: Floresta, Tumulo, Estrada',
  OC: 'Ex.: Gate 1, Gate 2, Kukra',
}

export function partyMapLabel(map: PartyMap): string {

  return PARTY_MAP_OPTIONS.find((o) => o.value === map)?.label ?? map

}



export const PARTY_MAX_MEMBERS = 8



export type PartyPendingKind = 'JOIN_REQUEST' | 'INVITE'



export interface PartyMemberSummary {

  id: number

  nickname: string

  className: string | null

  classImageUrl: string | null

  level: number

  leader: boolean

}



export interface PartySummary {

  id: number

  number: number

  map: PartyMap

  spot: string | null

  leaderId: number | null

  members: PartyMemberSummary[]

  memberCount: number

}



export interface PartyLfgEntry {

  memberId: number

  nickname: string

  className: string | null

  classImageUrl: string | null

  level: number

  note: string | null

  /** When the member joined the waiting list. */
  createdAt: string

}



export interface PartyPendingItem {

  id: number

  kind: PartyPendingKind

  partyId: number

  partyMap: PartyMap

  otherMember: PartyMemberSummary

  createdAt: string

}



export interface MyPartyState {

  partyId: number | null

  partyNumber: number | null

  partyMap: PartyMap | null

  partySpot: string | null

  leader: boolean

  canOrganizeParties: boolean

  lfg: PartyLfgEntry | null

  pending: PartyPendingItem[]

}



export interface PartyMemberNotice {

  type: 'KICKED_FROM_PARTY'

  message: string

  partyId: number

  partyMap: PartyMap

}



export interface PartyBoard {

  parties: PartySummary[]

  lfg: PartyLfgEntry[]

  my: MyPartyState

  /** When the server built this snapshot (also drives the waiting timers). */
  serverTime: string

}



export function formatPartyLabel(party: Pick<PartySummary, 'number' | 'map' | 'spot'>): string {

  const parts = [`PT #${party.number}`, partyMapLabel(party.map)]

  if (partyMapHasSpot(party.map) && party.spot) {

    parts.push(party.spot)

  }

  return parts.join(' · ')

}


