/**
 * Checks member account deletion (Líder/Administrador) against the isolated stress backend (8081).
 * Run from frontend/: node scripts/member-delete-test.mjs
 */
import { Client } from '@stomp/stompjs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STRESS_BASE ?? 'http://localhost:8081'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/websocket'
const SECRET = process.env.STRESS_JWT_SECRET ?? 'stress-test-secret-key-at-least-256-bits-long-for-hmac-sha256!!'
const PG = ['exec', '-i', 'guild-postgres', 'psql', '-U', 'guild', '-d', process.env.STRESS_DB ?? 'guild_points_stress', '-At', '-c']

const sql = (q) => execFileSync('docker', [...PG, q], { encoding: 'utf8' }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b64url = (v) => Buffer.from(JSON.stringify(v)).toString('base64url')
function jwt(id) {
  const now = Math.floor(Date.now() / 1000)
  const h = b64url({ alg: 'HS256', typ: 'JWT' })
  const b = b64url({ sub: String(id), iat: now, exp: now + 3600 })
  return `${h}.${b}.${createHmac('sha256', SECRET).update(`${h}.${b}`).digest('base64url')}`
}
async function api(id, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwt(id)}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { status: res.status, data }
}

let failed = 0
const check = (name, ok, detail = '') => {
  if (!ok) failed++
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Fresh test members (APROVADO, Cora race so party rules accept them).
const cora = sql(`SELECT id FROM game_race WHERE name ILIKE '%cora%' LIMIT 1`)
const cls = sql(`SELECT id FROM character_class WHERE race_id = ${cora} LIMIT 1`)
const tag = Date.now().toString(36)
function newMember(nick, role = 'MEMBRO', points = 500) {
  return Number(sql(`INSERT INTO member (email, nickname, role, status, points, profile_complete, race_id, class_id)
    VALUES ('del_${nick}_${tag}@test', '${nick}_${tag}', '${role}', 'APROVADO', ${points}, true, ${cora}, ${cls}) RETURNING id`).split('\n')[0])
}
const admin = Number(sql(`SELECT id FROM member WHERE email = 'stress_admin@test'`))
const target = newMember('Alvo')
const partner = newMember('Parceiro')
const lfgMember = newMember('Espera')
const otherAdmin = newMember('Admin2', 'ADMINISTRADOR')
const plain = newMember('Comum')
const bidder = newMember('Lanceador', 'MEMBRO', 1000)
const itemId = Number(sql(`SELECT id FROM item WHERE NOT deleted ORDER BY id LIMIT 1`))

console.log('\n═══ Permissões ═══')
let r = await api(plain, 'DELETE', `/members/${target}`)
check('Membro comum NÃO pode excluir', r.status === 403, `HTTP ${r.status}`)
r = await api(admin, 'DELETE', `/members/${admin}`)
check('Ninguém exclui a própria conta', r.status === 400, r.data?.message)
r = await api(admin, 'DELETE', `/members/${otherAdmin}`)
check('Administrador NÃO exclui outro Administrador', r.status === 403, r.data?.message)
const leader = sql(`SELECT id FROM member WHERE role = 'LIDER' LIMIT 1`)
if (leader) {
  r = await api(admin, 'DELETE', `/members/${leader}`)
  check('Ninguém exclui o Líder', r.status === 400 || r.status === 403, r.data?.message)
}

console.log('\n═══ Bloqueio por leilão em andamento ═══')
const auction = (await api(admin, 'POST', '/auctions', { durationMinutes: 5, items: [{ itemId, quantity: 1 }] })).data
await api(bidder, 'POST', `/auctions/${auction.id}/bids`, { amount: 200 })
r = await api(admin, 'DELETE', `/members/${bidder}`)
check('Não exclui quem está vencendo leilão em andamento', r.status === 409, r.data?.message)
await api(admin, 'POST', `/auctions/${auction.id}/cancel`)
r = await api(admin, 'DELETE', `/members/${bidder}`)
check('Depois de encerrar o leilão, a exclusão passa', r.status === 204, `HTTP ${r.status}`)

console.log('\n═══ Party, lista de espera e convites ═══')
r = await api(target, 'POST', '/parties', { map: 'ETHER' })
const partyId = r.data?.parties?.find((p) => p.members?.some((m) => m.memberId === target || m.id === target))?.id
  ?? Number(sql(`SELECT party_id FROM party_member WHERE member_id = ${target}`) || 0)
check('Alvo criou uma PT', partyId > 0, `HTTP ${r.status} PT ${partyId}`)
r = await api(partner, 'POST', `/parties/${partyId}/requests`)
check('Parceiro pediu para entrar (pendente)', r.status < 300, `HTTP ${r.status}`)
r = await api(lfgMember, 'PUT', '/parties/lfg', { note: 'teste' })
check('Outro membro entrou na lista de espera', r.status < 300, `HTTP ${r.status}`)

console.log('\n═══ Exclusão ═══')
const pointsBefore = Number(sql(`SELECT points FROM member WHERE id = ${target}`))
const adjBefore = Number(sql(`SELECT count(*) FROM points_adjustment WHERE member_id = ${target}`))

// Live session of the target: must receive ACCOUNT_DELETED.
let kicked = false
const ws = new Client({
  webSocketFactory: () => new WebSocket(WS_URL),
  connectHeaders: { Authorization: `Bearer ${jwt(target)}` },
  heartbeatIncoming: 0, heartbeatOutgoing: 0, reconnectDelay: 0,
})
await new Promise((resolve) => {
  ws.onConnect = () => {
    ws.subscribe(`/topic/account/${target}`, (m) => { if (JSON.parse(m.body).type === 'ACCOUNT_DELETED') kicked = true })
    resolve()
  }
  ws.activate()
})
check('Token do alvo funciona antes', (await api(target, 'GET', '/members/me')).status === 200)

r = await api(admin, 'DELETE', `/members/${target}`)
check('Administrador exclui a conta', r.status === 204, `HTTP ${r.status}`)
await api(admin, 'DELETE', `/members/${lfgMember}`)
await sleep(500)

check('Sessão aberta recebeu ACCOUNT_DELETED (logout na hora)', kicked)
r = await api(target, 'GET', '/members/me')
check('Token antigo deixa de funcionar', r.status === 401 || r.status === 403, `HTTP ${r.status}`)
const row = sql(`SELECT status, coalesce(email,'∅'), coalesce(discord_id,'∅'), coalesce(password_hash,'∅'), deleted_at IS NOT NULL FROM member WHERE id = ${target}`)
check('Status EXCLUIDO, e-mail/Discord/senha apagados', row.startsWith('EXCLUIDO|∅|∅|∅|t'), row)
r = await api(admin, 'DELETE', `/members/${target}`)
check('Não exclui duas vezes', r.status === 409, r.data?.message)

check('Saiu da PT (PT vazia foi desfeita)', Number(sql(`SELECT count(*) FROM party_member WHERE member_id = ${target}`)) === 0
  && Number(sql(`SELECT count(*) FROM party WHERE id = ${partyId}`)) === 0)
check('Pedido de entrada pendente foi cancelado',
  Number(sql(`SELECT count(*) FROM party_pending WHERE (initiator_id = ${target} OR target_id = ${target} OR initiator_id = ${partner}) AND status = 'PENDING'`)) === 0)
check('Saiu da lista de espera', Number(sql(`SELECT count(*) FROM party_lfg WHERE member_id = ${lfgMember}`)) === 0)

const ranking = (await api(admin, 'GET', '/members/ranking')).data
check('Some do ranking', !ranking.some((m) => m.id === target))
check('Histórico de pontos preservado',
  Number(sql(`SELECT points FROM member WHERE id = ${target}`)) === pointsBefore &&
  Number(sql(`SELECT count(*) FROM points_adjustment WHERE member_id = ${target}`)) === adjBefore)
check('Log MEMBER_DELETED registrado',
  Number(sql(`SELECT count(*) FROM audit_log WHERE type = 'MEMBER_DELETED' AND target_id = ${target}`)) === 1)

r = await api(admin, 'POST', '/members/' + target + '/points', { amount: 1, modality: 'AJUSTE', reason: 'x' })
check('Não ajusta pontos de conta excluída', r.status === 409, r.data?.message)
r = await api(admin, 'PATCH', `/members/${target}/approval`, { status: 'APROVADO' })
check('Não reativa conta excluída pela aprovação', r.status === 409, r.data?.message)

await ws.deactivate()
console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
