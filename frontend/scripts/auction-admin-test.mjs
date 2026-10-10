/**
 * Checks "Encerrar leilão" (cancel) and "Excluir leilão" (delete) against the isolated stress
 * backend (8081). Run from frontend/: node scripts/auction-admin-test.mjs
 */
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STRESS_BASE ?? 'http://localhost:8081'
const SECRET = process.env.STRESS_JWT_SECRET ?? 'stress-test-secret-key-at-least-256-bits-long-for-hmac-sha256!!'
const PG = ['exec', '-i', 'guild-postgres', 'psql', '-U', 'guild', '-d', process.env.STRESS_DB ?? 'guild_points_stress', '-At', '-c']

const sql = (q) => execFileSync('docker', [...PG, q], { encoding: 'utf8' }).trim()
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

const id = (email) => Number(sql(`SELECT id FROM member WHERE email = '${email}'`))
const admin = id('stress_admin@test')
const [a, b, member] = [1, 2, 3].map((n) => id(`stress_bot_${n}@test`))
const itemId = Number(sql(`SELECT id FROM item WHERE NOT deleted ORDER BY id LIMIT 1`))
sql(`UPDATE member SET points = 1000 WHERE id IN (${a}, ${b}, ${member})`)
const pts = (m) => Number(sql(`SELECT points FROM member WHERE id = ${m}`))
const available = async (m) => (await api(m, 'GET', '/members/me')).data?.availablePoints

console.log('\n═══ Encerrar leilão (cancelar) ═══')
const auction = (await api(admin, 'POST', '/auctions', { durationMinutes: 5, items: [{ itemId, quantity: 1 }] })).data
await api(a, 'POST', `/auctions/${auction.id}/bids`, { amount: 300 })
await api(b, 'POST', `/auctions/${auction.id}/bids`, { amount: 400 })
check('B lidera com 400 → saldo disponível de B reservado', (await available(b)) === 600, `${await available(b)} pts`)

const notAllowed = await api(member, 'POST', `/auctions/${auction.id}/cancel`)
check('Membro comum NÃO pode encerrar', notAllowed.status === 403, `HTTP ${notAllowed.status}`)
const deleteActive = await api(admin, 'DELETE', `/auctions/${auction.id}`)
check('Não pode excluir leilão em andamento', deleteActive.status === 409, deleteActive.data?.message ?? `HTTP ${deleteActive.status}`)

const cancelled = await api(admin, 'POST', `/auctions/${auction.id}/cancel`)
check('Administrador encerra o leilão', cancelled.status === 200 && cancelled.data.status === 'CANCELLED', cancelled.data?.status)
check('Sem vencedor', cancelled.data.winnerId == null)
check('Reserva de B devolvida (disponível = 1000)', (await available(b)) === 1000, `${await available(b)} pts`)
check('Ninguém foi cobrado (total de A e B = 1000)', pts(a) === 1000 && pts(b) === 1000, `A=${pts(a)} B=${pts(b)}`)
const lateBid = await api(a, 'POST', `/auctions/${auction.id}/bids`, { amount: 500 })
check('Lance após encerrar é recusado', lateBid.status >= 400, lateBid.data?.message)
const again = await api(admin, 'POST', `/auctions/${auction.id}/cancel`)
check('Não encerra duas vezes', again.status === 409, again.data?.message)
check('Log AUCTION_CANCELLED registrado', Number(sql(`SELECT count(*) FROM audit_log WHERE type = 'AUCTION_CANCELLED' AND payload->>'auctionId' = '${auction.id}'`)) === 1)

console.log('\n═══ Excluir leilão encerrado ═══')
const memberDelete = await api(member, 'DELETE', `/auctions/${auction.id}`)
check('Membro comum NÃO pode excluir', memberDelete.status === 403, `HTTP ${memberDelete.status}`)
const del = await api(admin, 'DELETE', `/auctions/${auction.id}`)
check('Administrador exclui o leilão cancelado', del.status === 204, `HTTP ${del.status}`)
check('Leilão some (404)', (await api(admin, 'GET', `/auctions/${auction.id}`)).status === 404)
check(
  'Lances, itens e chat apagados junto',
  Number(sql(`SELECT (SELECT count(*) FROM auction_bid WHERE auction_id = ${auction.id}) + (SELECT count(*) FROM auction_message WHERE auction_id = ${auction.id}) + (SELECT count(*) FROM auction_item WHERE auction_id = ${auction.id})`)) === 0,
)

// A CLOSED auction with a charged winner: deleting must not refund or charge anyone.
const closedRow = sql(`SELECT id, winner_id FROM auction WHERE status = 'CLOSED' AND winner_id IS NOT NULL ORDER BY id DESC LIMIT 1`)
if (closedRow) {
  const [closedId, winnerId] = closedRow.split('|').map(Number)
  const before = pts(winnerId)
  const adjBefore = Number(sql(`SELECT count(*) FROM points_adjustment WHERE member_id = ${winnerId}`))
  const delClosed = await api(admin, 'DELETE', `/auctions/${closedId}`)
  check(`Exclui leilão encerrado #${closedId} com vencedor`, delClosed.status === 204, `HTTP ${delClosed.status}`)
  check(
    'Pontos do vencedor não mudam ao excluir',
    pts(winnerId) === before && Number(sql(`SELECT count(*) FROM points_adjustment WHERE member_id = ${winnerId}`)) === adjBefore,
    `${before} → ${pts(winnerId)}`,
  )
}

console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
