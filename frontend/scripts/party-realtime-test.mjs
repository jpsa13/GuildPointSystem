/**
 * Party realtime test — real STOMP clients against the isolated stress backend (8081).
 * Checks that every change reaches every client, waiting-list ordering, and race conditions.
 * Run from frontend/: node scripts/party-realtime-test.mjs
 */
import { Client } from '@stomp/stompjs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STRESS_BASE ?? 'http://localhost:8081'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/websocket'
const SECRET = process.env.STRESS_JWT_SECRET ?? 'stress-test-secret-key-at-least-256-bits-long-for-hmac-sha256!!'
const PG = ['exec', '-i', 'guild-postgres', 'psql', '-U', 'guild', '-d', process.env.STRESS_DB ?? 'guild_points_stress', '-At', '-c']
const CLIENTS = 20

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
const pct = (v, p) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor((p / 100) * v.length))]

// ─── Setup: fresh approved Cora members + clean party tables ──────────────────
sql(`DELETE FROM party_pending; DELETE FROM party_member; DELETE FROM party; DELETE FROM party_lfg;`)
const cora = sql(`SELECT id FROM game_race WHERE name ILIKE '%cora%' LIMIT 1`)
const cls = sql(`SELECT id FROM character_class WHERE race_id = ${cora} LIMIT 1`)
const tag = Date.now().toString(36)
const ids = sql(`INSERT INTO member (email, nickname, role, status, points, profile_complete, race_id, class_id)
  SELECT 'pt_' || g || '_${tag}@test', 'PT' || lpad(g::text, 2, '0') || '_${tag}', 'MEMBRO', 'APROVADO', 0, true, ${cora}, ${cls}
  FROM generate_series(1, ${CLIENTS}) g RETURNING id`).split('\n').filter((l) => /^\d+$/.test(l)).map(Number)
const admin = Number(sql(`SELECT id FROM member WHERE email = 'stress_admin@test'`))
sql(`UPDATE member SET race_id = ${cora}, class_id = ${cls} WHERE id = ${admin}`)

// ─── Clients: each counts BOARD_UPDATED events and personal notices ───────────
const clients = await Promise.all(
  ids.map(
    (id) =>
      new Promise((resolve) => {
        const c = { id, events: [], notices: [] }
        c.client = new Client({
          webSocketFactory: () => new WebSocket(WS_URL),
          connectHeaders: { Authorization: `Bearer ${jwt(id)}` },
          heartbeatIncoming: 0, heartbeatOutgoing: 0, reconnectDelay: 0,
          onConnect: () => {
            c.client.subscribe('/topic/parties', (m) => { c.events.push(Date.now()); c.last = JSON.parse(m.body) })
            c.client.subscribe(`/topic/parties/member/${id}`, (m) => c.notices.push(JSON.parse(m.body)))
            resolve(c)
          },
        })
        c.client.activate()
      }),
  ),
)
console.log(`${clients.length} clientes conectados em /topic/parties`)

/** Runs an action and checks every client got a board event; returns latencies. */
const latencies = []
async function broadcast(name, action) {
  const before = clients.map((c) => c.events.length)
  const start = Date.now()
  const r = await action()
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && clients.some((c, i) => c.events.length <= before[i])) await sleep(10)
  const got = clients.filter((c, i) => c.events.length > before[i])
  const lat = got.map((c) => c.events[c.events.length - 1] - start)
  latencies.push(...lat)
  check(`${name} → evento para os ${clients.length} clientes`, got.length === clients.length && (!r || r.status < 300),
    `HTTP ${r?.status ?? '-'} · ${got.length}/${clients.length} · p50 ${pct(lat, 50)}ms`)
  return r
}
const board = async (id) => (await api(id, 'GET', '/parties/board')).data
const [A, B, C, D, E, F, G, H] = ids

console.log('\n═══ Mudanças refletidas em tempo real ═══')
let r = await broadcast('A cria PT', () => api(A, 'POST', '/parties', { map: 'ETHER', spot: 'Teste' }))
const ptA = r.data.my.partyId
let bd = await board(B)
check('Outro membro vê a PT nova após o evento', bd.parties.some((p) => p.id === ptA))
const lastOf = (id) => clients.find((c) => c.id === id).last
check('Broadcast já traz o board com a PT nova (sem refetch)', lastOf(C)?.board?.parties.some((p) => p.id === ptA))
check('Broadcast não traz estado pessoal', lastOf(C)?.board && !('my' in lastOf(C).board))

r = await broadcast('B pede entrada', () => api(B, 'POST', `/parties/${ptA}/requests`))
const pendingB = (await board(A)).my.pending.find((p) => p.kind === 'JOIN_REQUEST')
check('Líder vê o pedido pendente', !!pendingB)
check('Broadcast avisa só A e B para recarregar pendências', [A, B].every((id) => lastOf(C)?.pendingMemberIds?.includes(id))
  && lastOf(C)?.pendingMemberIds?.length === 2 && lastOf(C)?.joinRequestsChanged === true)
await broadcast('A aceita B', () => api(A, 'POST', `/parties/pending/${pendingB.id}/accept`))
bd = await board(C)
check('Todos veem B na PT', bd.parties.find((p) => p.id === ptA)?.members.some((m) => m.id === B))

console.log('\n═══ Lista de espera: ordem e tempo ═══')
for (const id of [C, D, E]) {
  await broadcast(`Membro ${ids.indexOf(id) + 1} entra na lista de espera`, () => api(id, 'PUT', '/parties/lfg', {}))
  await sleep(1100)
}
bd = await board(F)
check('Lista ordenada por quem espera há mais tempo', bd.lfg.map((e) => e.memberId).join() === [C, D, E].join(),
  bd.lfg.map((e) => e.nickname).join(' > '))
check('Board traz serverTime para os contadores', !!bd.serverTime)
const waits = bd.lfg.map((e) => (new Date(bd.serverTime) - new Date(e.createdAt)) / 1000)
check('Tempos de espera decrescentes (C > D > E)', waits[0] > waits[1] && waits[1] > waits[2], waits.map((w) => `${w.toFixed(1)}s`).join(' · '))
await api(C, 'PUT', '/parties/lfg', { note: 'atualizei a nota' })
bd = await board(F)
check('Reentrar/atualizar não zera o tempo de quem já está na fila', bd.lfg[0].memberId === C)

await broadcast('B sai da PT', () => api(B, 'POST', `/parties/${ptA}/leave`))
bd = await board(F)
check('Quem sai da PT vai para o fim da fila', bd.lfg.at(-1)?.memberId === B, bd.lfg.map((e) => e.nickname).join(' > '))

await broadcast('Admin arrasta C da fila para a PT', () => api(admin, 'POST', `/parties/${ptA}/move`, { memberId: C, fromPartyId: null }))
bd = await board(F)
check('C saiu da fila e entrou na PT', !bd.lfg.some((e) => e.memberId === C) && bd.parties.find((p) => p.id === ptA).members.some((m) => m.id === C))

const cNotices = clients.find((c) => c.id === C).notices.length
await broadcast('A expulsa C', () => api(A, 'POST', `/parties/${ptA}/kick`, { memberId: C }))
await sleep(300)
check('C recebe aviso pessoal de expulsão', clients.find((c) => c.id === C).notices.length === cNotices + 1)

await broadcast('Admin cria PT vazia', () => api(admin, 'POST', '/parties/empty', { map: 'ELAN' }))
const emptyPt = (await board(F)).parties.find((p) => p.memberCount === 0)?.id
await broadcast('Admin dissolve PT do A', () => api(admin, 'DELETE', `/parties/${ptA}`))
await sleep(300)
bd = await board(F)
check('PT dissolvida some para todos', !bd.parties.some((p) => p.id === ptA))
check('A recebe aviso e volta para a fila', clients.find((c) => c.id === A).notices.length >= 1 && bd.lfg.some((e) => e.memberId === A))
await broadcast('Admin remove a PT vazia', () => api(admin, 'DELETE', `/parties/${emptyPt}`))

console.log('\n═══ Corridas (concorrência) ═══')
const dbl = await Promise.all([api(F, 'POST', '/parties', { map: 'OC' }), api(F, 'POST', '/parties', { map: 'OC' })])
const st = dbl.map((x) => x.status).sort()
check('Duplo clique em "Criar PT" → uma criada, outra recusada sem erro 500', st[0] === 201 && st[1] >= 400 && st[1] < 500,
  `${st.join(' / ')} — ${dbl.find((x) => x.status >= 400)?.data?.message}`)
check('F está em exatamente 1 PT', Number(sql(`SELECT count(*) FROM party_member WHERE member_id = ${F}`)) === 1)
const ptF = Number(sql(`SELECT party_id FROM party_member WHERE member_id = ${F}`))
await api(admin, 'DELETE', `/parties/${ptF}`)

// "Last member leaves" racing "admin adds someone": nobody may vanish from both PT and waiting list.
let vanished = 0
let serverErrors = 0
for (let i = 0; i < 15; i++) {
  const leaderId = G
  const joinerId = H
  await api(leaderId, 'DELETE', '/parties/lfg').catch(() => {})
  const created = await api(leaderId, 'POST', '/parties', { map: 'CAULDRON' })
  const pt = created.data?.my?.partyId
  await api(joinerId, 'PUT', '/parties/lfg', {})
  const [leave, move] = await Promise.all([
    api(leaderId, 'POST', `/parties/${pt}/leave`),
    api(admin, 'POST', `/parties/${pt}/move`, { memberId: joinerId, fromPartyId: null }),
  ])
  if (leave.status >= 500 || move.status >= 500) serverErrors++
  const inParty = Number(sql(`SELECT count(*) FROM party_member WHERE member_id = ${joinerId}`))
  const inLfg = Number(sql(`SELECT count(*) FROM party_lfg WHERE member_id = ${joinerId}`))
  if (inParty + inLfg !== 1) vanished++
  sql(`DELETE FROM party_member WHERE member_id IN (${leaderId}, ${joinerId}); DELETE FROM party WHERE id NOT IN (SELECT party_id FROM party_member); DELETE FROM party_lfg WHERE member_id IN (${leaderId}, ${joinerId});`)
}
check('"Último sai" × "admin adiciona" (15x): ninguém some da PT e da fila', vanished === 0, `${vanished} sumiço(s), ${serverErrors} erro(s) 500`)

// Opposite moves between two PTs at the same time must not deadlock.
let deadlocks = 0
for (let i = 0; i < 10; i++) {
  sql(`DELETE FROM party_pending; DELETE FROM party_member; DELETE FROM party; DELETE FROM party_lfg;`)
  const p1 = (await api(A, 'POST', '/parties', { map: 'MB' })).data.my.partyId
  const p2 = (await api(B, 'POST', '/parties', { map: 'MB' })).data.my.partyId
  await api(admin, 'POST', `/parties/${p1}/members`, { memberId: D })
  await api(admin, 'POST', `/parties/${p2}/members`, { memberId: E })
  const res = await Promise.all([
    api(admin, 'POST', `/parties/${p2}/move`, { memberId: D, fromPartyId: p1 }),
    api(admin, 'POST', `/parties/${p1}/move`, { memberId: E, fromPartyId: p2 }),
  ])
  if (res.some((x) => x.status >= 500)) deadlocks++
}
check('Movimentos cruzados A→B e B→A simultâneos (10x): sem deadlock/erro 500', deadlocks === 0, `${deadlocks} falha(s)`)

console.log(`\nLatência evento → cliente: p50 ${pct(latencies, 50)}ms · p95 ${pct(latencies, 95)}ms · máx ${Math.max(...latencies)}ms (${latencies.length} entregas)`)
sql(`DELETE FROM party_pending; DELETE FROM party_member; DELETE FROM party; DELETE FROM party_lfg;`)
await Promise.all(clients.map((c) => c.client.deactivate()))
console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
