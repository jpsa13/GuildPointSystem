import type { AuditLogEntry, AuditLogType } from '@/Domain/types/models'

const LOG_TYPE_LABELS: Record<AuditLogType, string> = {
  OBJECTIVE_CREATED: 'Objetivo criado',
  OBJECTIVE_UPDATED: 'Objetivo editado',
  OBJECTIVE_DELETED: 'Objetivo removido',
  EVENT_CREATED: 'Evento criado',
  EVENT_CLAIMED: 'Evento resgatado',
  EVENT_DENIED: 'Evento removido do membro',
  EVENT_CANCELLED: 'Evento cancelado',
  POINTS_ADJUSTED: 'Pontos ajustados',
  AUCTION_CREATED: 'Leilão criado',
  AUCTION_CLOSED: 'Leilão encerrado',
  AUCTION_CANCELLED: 'Leilão cancelado',
  AUCTION_DELETED: 'Leilão excluído',
  PROFILE_UPDATED: 'Perfil alterado',
  MEMBER_APPROVED: 'Cadastro aprovado',
  MEMBER_REJECTED: 'Cadastro rejeitado',
  MEMBER_REGISTERED: 'Novo cadastro',
  MEMBER_ROLE_CHANGED: 'Papel alterado',
  MEMBER_DELETED: 'Conta excluída',
}

const ROLE_LABELS: Record<string, string> = {
  MEMBRO: 'Membro',
  MODERADOR: 'Moderador',
  ADMINISTRADOR: 'Administrador',
  LIDER: 'Líder',
}

const PROFILE_FIELD_LABELS: Record<string, string> = {
  nickname: 'Nickname',
  classId: 'Classe',
  raceId: 'Raça',
  level: 'Level',
}

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function getLogTypeLabel(type: AuditLogType): string {
  return LOG_TYPE_LABELS[type] ?? type
}

export function formatLogDetails(log: AuditLogEntry): string {
  const p = log.payload

  switch (log.type) {
    case 'OBJECTIVE_CREATED': {
      const limit =
        p.type === 'LIMITADO' && p.dailyLimit
          ? ` · limite ${p.dailyLimit}/dia`
          : ''
      return `"${str(p.name)}" · ${str(p.points)} pts${limit}`
    }
    case 'OBJECTIVE_UPDATED':
    case 'OBJECTIVE_DELETED':
      return `"${str(p.name)}"`
    case 'EVENT_CREATED':
      return `${str(p.objectiveName)} · ${str(p.durationMinutes)} min`
    case 'EVENT_CLAIMED':
      return `${str(p.objectiveName)} · +${str(p.points)} pts`
    case 'EVENT_DENIED': {
      const reason = str(p.reason)
      const points = str(p.pointsReverted)
      return reason ? `"${reason}" · -${points} pts` : `-${points} pts revertidos`
    }
    case 'EVENT_CANCELLED':
      return str(p.objectiveName)
    case 'POINTS_ADJUSTED': {
      const amount = Number(p.amount)
      const sign = amount >= 0 ? '+' : ''
      return `${sign}${amount} pts · ${str(p.reason)}`
    }
    case 'AUCTION_CREATED':
      return `#${str(p.auctionId)} · ${str(p.durationMinutes)} min`
    case 'AUCTION_CLOSED': {
      const winner =
        p.winnerId === 'none' || p.winnerId == null
          ? 'Sem vencedor'
          : `Vencedor #${str(p.winnerId)}`
      return `${winner} · ${str(p.amount)} pts`
    }
    case 'AUCTION_CANCELLED': {
      const released = Array.isArray(p.releasedMemberIds) ? p.releasedMemberIds.length : 0
      return `#${str(p.auctionId)} · lance ${str(p.amount)} pts · ${released} reserva(s) devolvida(s)`
    }
    case 'AUCTION_DELETED':
      return `#${str(p.auctionId)} · ${str(p.items)}`
    case 'PROFILE_UPDATED': {
      const field = PROFILE_FIELD_LABELS[str(p.field)] ?? str(p.field)
      return `${field}: ${str(p.oldValue)} → ${str(p.newValue)}`
    }
    case 'MEMBER_APPROVED':
      return 'Membro aprovado na guild'
    case 'MEMBER_REJECTED':
      return 'Cadastro rejeitado'
    case 'MEMBER_REGISTERED':
      return str(p.nickname)
    case 'MEMBER_ROLE_CHANGED':
      return `${ROLE_LABELS[str(p.oldRole)] ?? str(p.oldRole)} → ${ROLE_LABELS[str(p.newRole)] ?? str(p.newRole)}`
    case 'MEMBER_DELETED':
      return `${str(p.nickname)} · ${ROLE_LABELS[str(p.role)] ?? str(p.role)} · ${str(p.points)} pts`
    default:
      return ''
  }
}

export function formatLogActor(log: AuditLogEntry): string {
  return log.actorNickname ?? '—'
}

export function formatLogTarget(log: AuditLogEntry): string {
  return log.targetNickname ?? '—'
}
