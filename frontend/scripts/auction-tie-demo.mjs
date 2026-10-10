/**
 * Visual demo: 1-minute auction, 30 bots. Random bots raise by 10–50 every 2–5s up to 490, then
 * 4 bots with exactly 500 pts reach 500 (1 outbid + 3 all-in ties) → DOLE → roulette among 4.
 *
 * Same setup as auction-stress-test.mjs (isolated backend on 8081). Watch it on the frontend
 * pointed at 8081. Run from frontend/:
 *   node scripts/auction-tie-demo.mjs
 */
import { Client } from '@stomp/stompjs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STRESS_BASE ?? 'http://localhost:8081'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/websocket'
const SECRET = process.env.STRESS_JWT_SECRET ?? 'stress-test-secret-key-at-least-256-bits-long-for-hmac-sha256!!'
const PG = ['exec', '-i', 'guild-postgres', 'psql', '-U', 'guild', '-d', process.env.STRESS_DB ?? 'guild_points_stress', '-At', '-c']

const BIDDERS = 26
const TIERS = 4
const TIE_AMOUNT = 500
// "Human" pacing: random gap between bids and random raise size.
const MIN_GAP_MS = 2000
const MAX_GAP_MS = 5000
const MIN_RAISE = 10
const MAX_RAISE = 50
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => execFileSync('docker', [...PG, q], { encoding: 'utf8' }).trim()
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
const clock = () => new Date().toLocaleTimeString('pt-BR', { hour12: false })

function jwt(memberId) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url({ sub: String(memberId), iat: now, exp: now + 3600 })
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

function connect(token, onConnect) {
  return new Promise((resolve, reject) => {
    const client = new Client({
      webSocketFactory: () => new WebSocket(WS_URL),
      connectHeaders: { Authorization: `Bearer ${token}` },
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      reconnectDelay: 0,
      onConnect: () => {
        onConnect?.(client)
        resolve(client)
      },
      onStompError: (f) => reject(new Error(f.headers.message)),
    })
    client.activate()
  })
}

// ─── Seed (idempotent) ────────────────────────────────────────────────────────

sql(`
  INSERT INTO member (email, nickname, role, status, points, profile_complete)
  VALUES ('stress_admin@test', 'StressAdmin', 'ADMINISTRADOR', 'APROVADO', 0, true)
  ON CONFLICT (email) DO NOTHING;
  INSERT INTO member (email, nickname, role, status, points, profile_complete)
  SELECT 'stress_bot_' || g || '@test', 'Bot' || lpad(g::text, 2, '0'), 'MEMBRO', 'APROVADO', 0, true
  FROM generate_series(1, 40) g
  ON CONFLICT (email) DO NOTHING;
  INSERT INTO item (type, name, image_url, created_by_id)
  SELECT 'MISC', 'Stress Relic', '/sprites/booty.png', id FROM member WHERE email = 'stress_admin@test'
    AND NOT EXISTS (SELECT 1 FROM item WHERE name = 'Stress Relic');
`)
const adminId = Number(sql(`SELECT id FROM member WHERE email = 'stress_admin@test'`))
// Auctioned item: a real catalog item by name (override with STRESS_ITEM_NAME), else the dummy relic.
const ITEM_NAME = (process.env.STRESS_ITEM_NAME ?? 'Advanced Strength Intense Black Siege Bow').replaceAll("'", "''")
const itemId = Number(
  sql(`SELECT id FROM item WHERE name = '${ITEM_NAME}' AND NOT deleted ORDER BY id LIMIT 1`) ||
    sql(`SELECT id FROM item WHERE name = 'Stress Relic' LIMIT 1`),
)
const bots = sql(`SELECT id, nickname FROM member WHERE email LIKE 'stress_bot_%' ORDER BY nickname LIMIT ${BIDDERS + TIERS}`)
  .split('\n')
  .map((l) => {
    const [id, nickname] = l.split('|')
    return { id: Number(id), nickname, token: jwt(Number(id)), pending: new Map(), seq: 0 }
  })
const regulars = bots.slice(0, BIDDERS)
const tiers = bots.slice(BIDDERS)
sql(`UPDATE member SET points = 10000 WHERE id IN (${regulars.map((b) => b.id).join(',')})`)
sql(`UPDATE member SET points = ${TIE_AMOUNT} WHERE id IN (${tiers.map((b) => b.id).join(',')})`)

// ─── Connect 30 bots ──────────────────────────────────────────────────────────

await Promise.all(
  bots.map(async (bot) => {
    bot.client = await connect(bot.token, (c) =>
      c.subscribe('/user/queue/auction-bids', (m) => {
        const r = JSON.parse(m.body)
        bot.pending.get(r.requestId)?.(r)
        bot.pending.delete(r.requestId)
      }),
    )
  }),
)
console.log(`${clock()}  ${bots.length} bots conectados (${BIDDERS} com 10000 pts, ${TIERS} com exatamente ${TIE_AMOUNT} pts)`)

function bid(bot, auctionId, amount) {
  const requestId = `${bot.id}-${++bot.seq}`
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ accepted: false, error: 'TIMEOUT' }), 10_000)
    bot.pending.set(requestId, (r) => {
      clearTimeout(timer)
      resolve(r)
    })
    bot.client.publish({ destination: `/app/auctions/${auctionId}/bid`, body: JSON.stringify({ requestId, amount }) })
  })
}

// ─── Create auction (1 min) ───────────────────────────────────────────────────

const res = await fetch(`${BASE}/api/auctions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt(adminId)}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ durationMinutes: 1, items: [{ itemId, quantity: 1 }] }),
})
const auction = await res.json()
console.log(`${clock()}  Leilão #${auction.id} criado (1 min) → ${BASE.replace('8081', '5174')}/auctions/${auction.id}`)

// Observer: prints the roulette timeline.
const done = new Promise((resolve) => {
  connect(jwt(adminId), (c) =>
    c.subscribe(`/topic/auctions/${auction.id}`, (m) => {
      const p = JSON.parse(m.body)
      if (p.type === 'BOT') console.log(`${clock()}  [sistema] ${p.message.content}`)
      if (p.type === 'TIE_BREAK_SPIN') console.log(`${clock()}  roleta girando…`)
      if (p.type === 'TIE_BREAK_RESULT') console.log(`${clock()}  sorteado (índice ${p.winnerIndex}) — roleta desacelerando`)
      if (p.type === 'AUCTION_CLOSED') {
        console.log(`${clock()}  ENCERRADO — vencedor: ${p.winnerNickname} com ${p.amount} pts`)
        resolve(c)
      }
    }),
  )
})

await sleep(1500) // time for viewers to open the auction from the toast

// ─── Bids: random raises (10–50) every 2–5s up to 490, then 4 bots on 500 ─────

const timeLeft = (a) => ((new Date(a.endsAt) - new Date(a.serverTime)) / 1000).toFixed(1)

let failures = 0
let total = 0
let current = 0
let leaderId = null

async function place(bot, amount) {
  total++
  const r = await bid(bot, auction.id, amount)
  const tie = r.auction?.tied ? ` | EMPATADOS (${r.auction.tiedCount}): ${r.auction.tiedMemberNicknames.join(', ')}` : ''
  if (r.accepted) {
    current = r.auction.currentBid
    leaderId = bot.id
    console.log(`${clock()}  ${bot.nickname} → ${amount} ✔  (tempo restante ${timeLeft(r.auction)}s)${tie}`)
  } else {
    failures++
    if (r.auction) current = r.auction.currentBid
    console.log(`${clock()}  ${bot.nickname} → ${amount} ✘  ${r.error}`)
  }
  await sleep(randInt(MIN_GAP_MS, MAX_GAP_MS))
}

// Regulars: a random non-leader raises by 10–50, capped so the tie bots can still land on 500.
while (current < TIE_AMOUNT - MIN_RAISE) {
  const candidates = regulars.filter((b) => b.id !== leaderId)
  const bot = candidates[randInt(0, candidates.length - 1)]
  const amount = Math.min(current + randInt(MIN_RAISE, MAX_RAISE), TIE_AMOUNT - MIN_RAISE)
  await place(bot, amount)
}
// Tie bots (exactly 500 pts each): first one outbids, the other three tie all-in.
for (const bot of tiers) await place(bot, TIE_AMOUNT)

console.log(`${clock()}  Lances encerrados (${total} lances, ${failures} recusados). Aguardando DOLE e roleta…`)
const observer = await done
await sleep(500)
await Promise.all([...bots.map((b) => b.client.deactivate()), observer.deactivate()])
process.exit(failures ? 1 : 0)
