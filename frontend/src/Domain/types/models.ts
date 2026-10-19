export type Role = 'MEMBRO' | 'MODERADOR' | 'ADMINISTRADOR' | 'LIDER'
export type MemberStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO' | 'EXCLUIDO'
export type ObjectiveType = 'NORMAL' | 'LIMITADO'
export type AuctionStatus = 'OPEN' | 'DOLE' | 'TIE_BREAK' | 'CLOSED' | 'CANCELLED'

/** Finished auctions: no more bids; CANCELLED = force-closed by leadership, nobody charged. */
export const isAuctionFinished = (status: AuctionStatus) => status === 'CLOSED' || status === 'CANCELLED'
export type ItemType = 'WEAPON' | 'ARMOR' | 'ACCESSORY' | 'MISC'
export type PointsModality = 'AJUSTE' | 'LEILAO' | 'EVENTO' | 'REVERSAO' | 'DOACAO'
export type DonationStatus = 'PENDENTE' | 'ACEITA' | 'RECUSADA'

export type AuditLogType =
  | 'OBJECTIVE_CREATED'
  | 'OBJECTIVE_UPDATED'
  | 'OBJECTIVE_DELETED'
  | 'EVENT_CREATED'
  | 'EVENT_CLAIMED'
  | 'EVENT_DENIED'
  | 'EVENT_CANCELLED'
  | 'POINTS_ADJUSTED'
  | 'AUCTION_CREATED'
  | 'AUCTION_CLOSED'
  | 'AUCTION_CANCELLED'
  | 'AUCTION_DELETED'
  | 'MEMBER_DELETED'
  | 'NEWS_CREATED'
  | 'NEWS_UPDATED'
  | 'NEWS_DELETED'
  | 'DONATION_ACCEPTED'
  | 'DONATION_REJECTED'
  | 'DONATION_RATE_UPDATED'
  | 'PROFILE_UPDATED'
  | 'MEMBER_APPROVED'
  | 'MEMBER_REJECTED'
  | 'MEMBER_REGISTERED'
  | 'MEMBER_ROLE_CHANGED'

export interface AuthResponse {
  token: string | null
  memberId: number
  nickname: string | null
  role: Role
  status: MemberStatus
  level: number
  profileComplete: boolean
}

export interface Member {
  id: number
  email: string
  nickname: string
  avatarUrl: string | null
  raceId: number
  raceName: string
  classId: number
  className: string
  classImageUrl: string | null
  role: Role
  status: MemberStatus
  points: number
  availablePoints: number
  level: number
  profileComplete: boolean
  lastLoginAt: string | null
}

export interface SeedOption {
  id: number
  name: string
  imageUrl?: string | null
}

export interface Objective {
  id: number
  name: string
  points: number
  type: ObjectiveType
  dailyLimit: number | null
  createdAt: string
}

export interface GuildEvent {
  id: number
  objectiveId: number
  objectiveName: string
  points: number
  durationMinutes: number
  createdAt: string
  expiresAt: string
  active: boolean
  claimedByMe: boolean
}

export interface EventClaim {
  id: number
  objectiveName: string
  points: number
  claimedAt: string
  denied: boolean
  manual: boolean
}

export interface ItemTalic {
  talicType: string
  level: number
  slot: number
}

export interface ItemGameIcon {
  category: LuaItemCategory
  gameIndex: number
  gameCode: string
  iconId: number
  spriteSheet: string
  spriteCols: number
}

export interface Item {
  id: number
  type: ItemType
  name: string
  rarity: string
  imageUrl: string | null
  gameCode: string | null
  gameIcon: ItemGameIcon | null
  description: string | null
  details: Record<string, unknown> | null
  talics: ItemTalic[]
  createdAt: string
}

export type EffectDisplayType = 'PERCENT_100' | 'FLAT' | 'BOOLEAN' | 'SEC_MILLIS'

export interface GameAccessoryEffect {
  code: number
  name: string
  displayType: EffectDisplayType
  rawValue: number | null
  displayValue: string
}

export interface GameAccessory {
  id: number
  gameCode: string
  name: string
  subtype: 'RING' | 'AMULET'
  iconId: number
  spriteSheet: string
  grade: number
  civilMask: string
  levelRequired: number
  fire: number
  water: number
  soil: number
  wind: number
  effects: GameAccessoryEffect[]
}

export interface GameArmor {
  id: number
  gameCode: string
  name: string
  slot: 'HELMET' | 'UPPER' | 'LOWER' | 'GAUNTLET' | 'SHOES'
  iconId: number
  spriteSheet: string
  spriteCols: number
  grade: number
  civilMask: string
  levelRequired: number
  defFc: number
  defFacing: number | null
  defFacingDisplay: number | null
  effects: GameAccessoryEffect[]
}

export type GameWeaponType =
  | 'KNIFE'
  | 'SWORD'
  | 'AXE'
  | 'HAMMER'
  | 'SPEAR'
  | 'BOW'
  | 'FIREARM'
  | 'LAUNCHER'
  | 'THROWING_KNIFE'
  | 'STAFF'
  | 'MINING_TOOL'
  | 'GRENADE_LAUNCHER'

export interface GameWeapon {
  id: number
  gameCode: string
  name: string
  weaponType: GameWeaponType
  iconId: number
  spriteSheet: string
  spriteCols: number
  grade: number
  civilMask: string
  levelRequired: number
  gaMinAf: number
  gaMaxAf: number
  maMinAf: number
  maMaxAf: number
  effects: GameAccessoryEffect[]
}

export interface CatalogIconRef {
  gameCode: string
  name: string
  iconId: number
  spriteSheet: string
  spriteCols?: number
}

export type LuaItemCategory =
  | 'WEAPON'
  | 'HELMET'
  | 'UPPER'
  | 'LOWER'
  | 'GLOVES'
  | 'SHOES'
  | 'AMULET'
  | 'RING'
  | 'SHIELD'
  | 'BOOTY'
  | 'BOX'
  | 'POTION'
  | 'RESOURCE'

export interface GameLuaItem {
  category: LuaItemCategory
  gameIndex: number
  gameCode: string
  name: string
  iconId: number
  spriteSheet: string
  spriteCols: number
  itemGrade: number
  levelRequired: number
}

export interface ItemSetEffect {
  code: number
  name: string
  displayType: EffectDisplayType
  rawValue: number | null
  displayValue: string
}

export interface ItemSet {
  id: number
  setCode: string
  civilMask: string | null
  head: string | null
  upper: string | null
  lower: string | null
  shoes: string | null
  gauntlet: string | null
  weapon: string | null
  shield: string | null
  amul1: string | null
  amul2: string | null
  ring1: string | null
  ring2: string | null
  cloack: string | null
  effects: ItemSetEffect[]
}

export interface EffectDefinition {
  code: number
  name: string
  displayType: EffectDisplayType
}

export interface AuctionItem {
  itemId: number
  itemName: string
  imageUrl: string | null
  quantity: number
  /** Game-catalog items render from a sprite instead of `imageUrl`. */
  gameIcon: ItemGameIcon | null
}

export interface Auction {
  id: number
  status: AuctionStatus
  durationMinutes: number
  createdAt: string
  endsAt: string
  currentBid: number
  winnerId: number | null
  winnerNickname: string | null
  leaderId: number | null
  leaderNickname: string | null
  tiedCount: number
  tied: boolean
  tiedMemberIds: number[]
  tiedMemberNicknames: string[]
  items: AuctionItem[]
  dolePhase: number
  /** 0 = none, 1 = countdown, 2 = spinning, 3 = landing on the drawn winner. */
  tieBreakPhase: number
  /** Monotonic per auction — newer state always has a higher version. */
  version: number
  serverTime: string
}

export interface News {
  id: number
  title: string
  /** Sanitized server-side; sanitized again before rendering. */
  contentHtml: string
  authorId: number | null
  authorNickname: string | null
  createdAt: string
  editorNickname: string | null
  updatedAt: string | null
}

export interface DonationSettings {
  /** Points credited per 1kk (1 million) of Disena. */
  pointsPerKk: number
  updatedByNickname: string | null
  updatedAt: string | null
}

export interface Donation {
  id: number
  memberId: number
  memberNickname: string | null
  amountKk: number
  status: DonationStatus
  createdAt: string
  reviewedByNickname: string | null
  reviewedAt: string | null
  /** Set once accepted: the rate in force at that moment. */
  pointsPerKk: number | null
  pointsAwarded: number | null
}

export interface AuctionBidResult {
  requestId: string
  auctionId: number
  amount: number
  accepted: boolean
  error: string | null
  auction: Auction | null
}

export interface AuctionMessage {
  id: number
  type: string
  content: string
  imageUrl: string | null
  createdAt: string
  member?: { id: number; nickname: string }
}

export interface AuditLogEntry {
  id: number
  type: AuditLogType
  actorId: number | null
  actorNickname: string | null
  targetId: number | null
  targetNickname: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}
