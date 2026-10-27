export type QuestState = 'PRESENT' | 'COMPLETION_SIGNAL' | 'REMOVED_UNKNOWN' | 'STATE_CHANGED'
export interface QuestEvent {
  eventId: string; runId: string; sequence: number; occurredAt: string
  code: string; title: string; clientHash: string; edfHash: string; definitionHash: string
  group: number; type: number; slot: number; state: QuestState
}
export interface QuestObservation {
  sessionId: string; source: 'SIMULATION' | 'LOCAL_MONITOR'; monitorVersion: string; event: QuestEvent; receivedAt: string
}
export interface QuestSession {
  id: string; source: 'SIMULATION' | 'LOCAL_MONITOR'; monitorVersion: string; createdAt: string
  expiresAt: string; revokedAt: string | null; lastReceivedAt: string | null
}
export interface QuestHistory {
  memberId: number; simulationEnabled: boolean; sessions: QuestSession[]
  events: QuestObservation[]; hasMore: boolean; nextOffset: number
  liveEnabled: boolean; player: PlayerStatus | null; expected: ExpectedQuest[]; npcCoverage: NpcCoverage[]
}
export interface QuestPairing { sessionId: string; token: string; expiresAt: string }
export interface QuestBrief { code: string; title: string; definitionHash: string; group: number; type: number; slot: number }
export interface PlayerStatus {
  sessionId: string | null; receivedAt: string; revoked: boolean
  sample: { sequence: number; sampledAt: string; status: 'OBSERVED' | 'UNAVAILABLE'; name: string; serial: number
    identityEpoch: string; level: number; xpPercent: number | null; quests: QuestBrief[] }
}
export interface DailyQuest { quest: { code: string; title: string; definitionHash: string }; npcName: string; npcCodes: string[]; races: number[]; objectives: string[] }
export interface ExpectedQuest { definition: DailyQuest; completionSignals: number; hidden: boolean }
export interface NpcCoverage { name: string; npcCodes: string[]; questCount: number }
