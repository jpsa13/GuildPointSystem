/**
 * Auction WebSocket stress test — 40 real STOMP clients against a running backend.
 *
 * Runs against an ISOLATED database (never the dev DB): seeds bots directly via psql.
 *
 *   docker exec guild-postgres psql -U guild -d postgres -c "CREATE DATABASE guild_points_stress OWNER guild;"
 *   # backend on 8081 pointing at that DB:
 *   SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/guild_points_stress SERVER_PORT=8081 \
 *   JWT_SECRET=<secret> SCHEDULE_TEST_ALERT=false ./mvnw spring-boot:run
 *   # then, from frontend/:
 *   STRESS_JWT_SECRET=<secret> node scripts/auction-stress-test.mjs
 *
 * Scenarios: global creation broadcast, 40-bot bursts at the start, 5-bot +5 races in the final
 * seconds (time extension), all-in tie rule, tie-break roulette secrecy/timeline, roulette
 * randomness across parallel auctions, double-spend across auctions, and error paths.
 */
import { Client } from '@stomp/stompjs'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const BASE = process.env.STRESS_BASE ?? 'http://localhost:8081'
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws/websocket'
const SECRET = process.env.STRESS_JWT_SECRET ?? 'stress-test-secret-key-at-least-256-bits-long-for-hmac-sha256!!'
const PG = ['exec', '-i', 'guild-postgres', 'psql', '-U', 'guild', '-d', process.env.STRESS_DB ?? 'guild_points_stress', '-At', '-c']
const BOT_COUNT = 40

// ─── Infra helpers ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sql = (q) => execFileSync('docker', [...PG, q], { encoding: 'utf8' }).trim()
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')

function jwt(memberId) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url({ sub: String(memberId), iat: now, exp: now + 3600 })
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

async function rest(token, method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${detail ? ` — ${detail}` : ''}`)
}

function pct(values, p) {
  if (!values.length) return NaN
  const s = [...values].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const fmtStats = (v) =>
  `n=${v.length} p50=${pct(v, 50)}ms p95=${pct(v, 95)}ms max=${Math.max(...v)}ms`

// ─── Bot (one STOMP session = one browser tab) ────────────────────────────────

class Bot {
  constructor(id, nickname) {
    this.id = id
    this.nickname = nickname
    this.token = jwt(id)
    this.pending = new Map()
    this.created = [] // { auction, at }
    this.auctions = new Map() // auctionId → latest Auction (by version)
    this.versionSeenAt = new Map() // `${auctionId}:${version}` → ms
    this.events = new Map() // auctionId → [{ type, payload, at }]
    this.subs = new Map()
    this.seq = 0
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.client = new Client({
        webSocketFactory: () => new WebSocket(WS_URL),
        connectHeaders: { Authorization: `Bearer ${this.token}` },
        heartbeatIncoming: 0,
        heartbeatOutgoing: 0,
        reconnectDelay: 0,
        onConnect: () => {
          this.client.subscribe('/topic/auctions', (m) => {
            const p = JSON.parse(m.body)
            if (p.type === 'AUCTION_CREATED') this.created.push({ auction: p.auction, at: Date.now() })
          })
          this.client.subscribe('/user/queue/auction-bids', (m) => {
            const r = JSON.parse(m.body)
            const done = this.pending.get(r.requestId)
            this.pending.delete(r.requestId)
            if (r.auction) this.track(r.auction)
            done?.({ ...r, replyAt: Date.now() })
          })
          resolve()
        },
        onStompError: (f) => reject(new Error(f.headers.message)),
        onWebSocketError: (e) => reject(e),
      })
      this.client.activate()
    })
  }

  track(auction) {
    // Clock offset as of receipt, so remaining time keeps ticking down for stale states.
    auction._offset ??= new Date(auction.serverTime).getTime() - Date.now()
    const key = `${auction.id}:${auction.version}`
    if (!this.versionSeenAt.has(key)) this.versionSeenAt.set(key, Date.now())
    const old = this.auctions.get(auction.id)
    if (!old || old.version <= auction.version) this.auctions.set(auction.id, auction)
  }

  watch(auctionId) {
    if (this.subs.has(auctionId)) return
    this.events.set(auctionId, [])
    this.subs.set(
      auctionId,
      this.client.subscribe(`/topic/auctions/${auctionId}`, (m) => {
        const p = JSON.parse(m.body)
        this.events.get(auctionId).push({ type: p.type, payload: p, at: Date.now() })
        if (p.type === 'AUCTION_UPDATE') this.track(p.auction)
      }),
    )
  }

  bid(auctionId, amount) {
    const requestId = `${this.id}-${++this.seq}`
    const sentAt = Date.now()
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        resolve({ requestId, accepted: false, error: 'TIMEOUT', sentAt, replyAt: Date.now(), bot: this })
      }, 10_000)
      this.pending.set(requestId, (r) => {
        clearTimeout(timer)
        resolve({ ...r, sentAt, bot: this })
      })
      this.client.publish({
        destination: `/app/auctions/${auctionId}/bid`,
        body: JSON.stringify({ requestId, amount }),
      })
    })
  }

  state(auctionId) {
    return this.auctions.get(auctionId)
  }

  disconnect() {
    return this.client.deactivate()
  }
}

/** Seconds left on the server clock, per a bot's latest state. */
function secondsLeft(auction) {
  const offset = auction._offset ?? new Date(auction.serverTime).getTime() - Date.now()
  return (new Date(auction.endsAt).getTime() - (Date.now() + offset)) / 1000
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const v = predicate()
    if (v) return v
    await sleep(50)
  }
  throw new Error(`Timeout esperando: ${label}`)
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function seed() {
  sql(`
    INSERT INTO member (email, nickname, role, status, points, profile_complete)
    VALUES ('stress_admin@test', 'StressAdmin', 'ADMINISTRADOR', 'APROVADO', 0, true)
    ON CONFLICT (email) DO NOTHING;
    INSERT INTO member (email, nickname, role, status, points, profile_complete)
    SELECT 'stress_bot_' || g || '@test', 'Bot' || lpad(g::text, 2, '0'), 'MEMBRO', 'APROVADO', 0, true
    FROM generate_series(1, ${BOT_COUNT}) g
    ON CONFLICT (email) DO NOTHING;
    INSERT INTO item (type, name, image_url, created_by_id)
    SELECT 'MISC', 'Stress Relic', '/sprites/booty.png', id FROM member WHERE email = 'stress_admin@test'
      AND NOT EXISTS (SELECT 1 FROM item WHERE name = 'Stress Relic');
  `)
  const adminId = Number(sql(`SELECT id FROM member WHERE email = 'stress_admin@test'`))
  const itemId = Number(sql(`SELECT id FROM item WHERE name = 'Stress Relic' LIMIT 1`))
  const bots = sql(`SELECT id, nickname FROM member WHERE email LIKE 'stress_bot_%' ORDER BY nickname`)
    .split('\n')
    .map((line) => {
      const [id, nickname] = line.split('|')
      return new Bot(Number(id), nickname)
    })
  return { adminToken: jwt(adminId), itemId, bots }
}

const setPoints = (bot, points) => sql(`UPDATE member SET points = ${points} WHERE id = ${bot.id}`)
const getPoints = (bot) => Number(sql(`SELECT points FROM member WHERE id = ${bot.id}`))

async function createAuction(ctx, minutes = 1) {
  const res = await rest(ctx.adminToken, 'POST', '/auctions', {
    durationMinutes: minutes,
    items: [{ itemId: ctx.itemId, quantity: 1 }],
  })
  if (res.status !== 201) throw new Error(`create auction failed: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

function eventsOf(bot, auctionId, type) {
  return (bot.events.get(auctionId) ?? []).filter((e) => e.type === type)
}

async function waitClosed(bots, auctionId, timeoutMs = 120_000) {
  await waitFor(
    () => bots.every((b) => b.state(auctionId)?.status === 'CLOSED'),
    timeoutMs,
    `leilão #${auctionId} encerrar em todos os clientes`,
  )
}

// ─── Scenario 1: 40 bots — creation broadcast, opening burst, final-seconds race ─

async function scenarioMain(ctx) {
  console.log('\n═══ Cenário 1: 40 clientes — criação, lances iniciais e reta final ═══')
  const { bots } = ctx
  bots.forEach((b) => setPoints(b, 100_000))

  // Creation broadcast
  const createdAt = Date.now()
  const auction = await createAuction(ctx)
  await waitFor(() => bots.every((b) => b.created.some((c) => c.auction.id === auction.id)), 5000, 'notificação de criação')
  const notifLat = bots.map((b) => b.created.find((c) => c.auction.id === auction.id).at - createdAt)
  const sample = bots[0].created.find((c) => c.auction.id === auction.id).auction
  check('Criação notificada aos 40 clientes', true, fmtStats(notifLat))
  check(
    'Notificação traz id, nome e imagem do item',
    sample.id === auction.id && sample.items[0]?.itemName === 'Stress Relic' && !!sample.items[0]?.imageUrl,
    `#${sample.id} "${sample.items[0]?.itemName}" ${sample.items[0]?.imageUrl}`,
  )

  bots.forEach((b) => b.watch(auction.id))
  await sleep(300)
  bots.forEach((b) => b.track(auction))

  // Opening burst: every bot fires 3 rounds simultaneously, each above what it last saw.
  const burst = []
  for (let round = 0; round < 3; round++) {
    const replies = await Promise.all(
      bots.map((b) => {
        const cur = b.state(auction.id)?.currentBid ?? 0
        return b.bid(auction.id, cur + 1 + Math.floor(Math.random() * 20))
      }),
    )
    burst.push(...replies)
  }
  const accepted = burst.filter((r) => r.accepted)
  const rejected = burst.filter((r) => !r.accepted)
  check(
    'Rajada inicial (120 lances simultâneos) processada sem timeout',
    !burst.some((r) => r.error === 'TIMEOUT'),
    `${accepted.length} aceitos, ${rejected.length} recusados`,
  )
  const acceptedByVersion = [...accepted].sort((a, b) => a.auction.version - b.auction.version)
  check(
    'Lances aceitos estritamente crescentes na ordem de processamento',
    acceptedByVersion.every((r, i) => i === 0 || r.amount > acceptedByVersion[i - 1].amount),
  )
  check(
    'Todo recusado recebeu motivo (lance atual igual/maior)',
    rejected.every((r) => /lance atual já é|maior lance/.test(r.error ?? '')),
    rejected[0]?.error ?? '',
  )

  // Broadcast latency: time from a bidder's SEND until each of the 40 clients saw that version.
  const broadcastLat = []
  for (const r of accepted) {
    for (const b of bots) {
      const seen = b.versionSeenAt.get(`${auction.id}:${r.auction.version}`)
      if (seen) broadcastLat.push(seen - r.sentAt)
    }
  }
  check('Latência lance → todos os 40 clientes (rajada)', true, fmtStats(broadcastLat))
  const replyLat = burst.map((r) => r.replyAt - r.sentAt)
  check('Latência de resposta ao autor do lance (rajada)', true, fmtStats(replyLat))

  // Final seconds: wait until < 12s left, then 5 bots race +5 with ms gaps.
  const observer = bots[39]
  await waitFor(() => secondsLeft(observer.state(auction.id)) < 12, 70_000, '<12s restantes')
  console.log(`  … reta final: ${secondsLeft(observer.state(auction.id)).toFixed(1)}s restantes`)

  const raceLog = []
  let lastWinner = null
  for (let round = 0; round < 8; round++) {
    // Round 5 waits for the very last seconds (≤ 3s) to prove the deadline is honored + extended.
    if (round === 5) {
      await waitFor(() => secondsLeft(observer.state(auction.id)) <= 3, 40_000, '≤3s restantes')
    }
    // Round 7 lets the clock hit zero and bids during DOLE (rescue rule).
    if (round === 6) {
      await waitFor(() => observer.state(auction.id).status === 'DOLE', 40_000, 'DOLE')
    }
    const st = observer.state(auction.id)
    const before = secondsLeft(st)
    const wasDole = st.status === 'DOLE'
    const racers = bots.filter((b) => b.id !== st.leaderId).slice(round * 5 % 30, (round * 5 % 30) + 5)
    const target = st.currentBid + 5
    const replies = await Promise.all(
      racers.map(async (b, i) => {
        await sleep(i * 2) // 0,2,4,6,8 ms apart
        return b.bid(auction.id, target)
      }),
    )
    const ok = replies.filter((r) => r.accepted)
    const bad = replies.filter((r) => !r.accepted)
    const winnerReply = ok[0]
    const after = winnerReply ? secondsLeft(winnerReply.auction) : NaN
    raceLog.push({ round, target, before, after, ok: ok.length, bad, winner: winnerReply?.bot.nickname })
    lastWinner = winnerReply?.bot ?? lastWinner
    check(
      `Reta final rodada ${round + 1}: 5 lances de ${target} → 1 aceito, 4 recusados em tempo real`,
      ok.length === 1 && bad.length === 4 && bad.every((r) => /lance atual já é/.test(r.error ?? '')),
      `vencedor ${winnerReply?.bot.nickname}, ${before.toFixed(1)}s → ${after.toFixed(1)}s; recusa: "${bad[0]?.error}"`,
    )
    check(
      wasDole
        ? `Rodada ${round + 1}: lance durante DOLE → +10s`
        : `Rodada ${round + 1}: lance com ≤15s → tempo volta para 25s`,
      wasDole ? after > 8.5 && after <= 10.5 : before <= 15 && after > 23.5 && after <= 25.5,
      `${wasDole ? `DOLE ${st.dolePhase}, ` : ''}${before.toFixed(2)}s → ${after.toFixed(2)}s`,
    )
    check(
      `Rodada ${round + 1}: recusados foram respondidos após o aceito (ordem real)`,
      bad.every((r) => r.auction && r.auction.version >= winnerReply.auction.version),
    )
    await sleep(300 + Math.random() * 900)
    // Keep us inside the ≤15s window for the next round.
    await waitFor(() => secondsLeft(observer.state(auction.id)) <= 14, 30_000, '≤14s restantes')
  }

  // Let it run out: DOLE 1..3 then close.
  await waitClosed(bots, auction.id)
  const dole = eventsOf(observer, auction.id, 'BOT').map((e) => e.payload.message.content)
  check('DOLE 1 → DOLE 2 → DOLE 3 anunciados', ['DOLE 1', 'DOLE 2', 'DOLE 3'].every((d) => dole.includes(d)), dole.slice(0, 4).join(' | '))
  const final = observer.state(auction.id)
  check('Vencedor = último lance aceito', final.winnerId === lastWinner.id, `${final.winnerNickname} com ${final.currentBid}`)
  const versions = new Set(bots.map((b) => b.state(auction.id).version))
  check('Os 40 clientes terminam com o mesmo estado (mesma versão)', versions.size === 1, `versão ${[...versions].join(',')}`)
  check('Pontos do vencedor debitados', getPoints(lastWinner) === 100_000 - final.currentBid, `${getPoints(lastWinner)} pts`)

  const late = await bots[0].bid(auction.id, final.currentBid + 100)
  check('Lance em leilão encerrado é recusado', !late.accepted, late.error)
  return auction.id
}

// ─── Scenario 2: tie rule + tie-break secrecy/timeline ───────────────────────

async function scenarioTie(ctx) {
  console.log('\n═══ Cenário 2: regra de empate (all-in) e roleta ═══')
  const [A, B, C, D] = ctx.bots
  const watchers = ctx.bots.slice(0, 10)
  setPoints(A, 1000)
  setPoints(B, 550)
  setPoints(C, 555)
  setPoints(D, 550)

  const auction = await createAuction(ctx)
  watchers.forEach((b) => b.watch(auction.id))
  await sleep(300)

  const r1 = await A.bid(auction.id, 550)
  check('A (1000 pts) dá 550', r1.accepted, r1.error ?? '')
  const r2 = await C.bid(auction.id, 550)
  check('C (555 pts) NÃO pode empatar em 550 (não é all-in)', !r2.accepted && /all-in/.test(r2.error), r2.error)
  const r3 = await C.bid(auction.id, 549)
  check('C não pode dar lance menor que o atual', !r3.accepted, r3.error)
  const r4 = await B.bid(auction.id, 550)
  check('B (550 pts) PODE empatar em 550 (all-in)', r4.accepted && r4.auction.tied, r4.error ?? '')
  check(
    'Estado mostra "Empatados" com os nicks',
    r4.auction.tiedMemberNicknames.join(',') === `${A.nickname},${B.nickname}`,
    r4.auction.tiedMemberNicknames.join(', '),
  )
  const r5 = await C.bid(auction.id, 556)
  check('C (555 pts) não pode passar do próprio saldo', !r5.accepted && /insuficiente/.test(r5.error), r5.error)
  const r6 = await A.bid(auction.id, 550)
  check('A (já empatado/vencendo) não pode repetir o lance', !r6.accepted, r6.error)
  const r7 = await D.bid(auction.id, 550)
  check('D (550 pts) entra no empate → 3 empatados', r7.accepted && r7.auction.tiedCount === 3, r7.error ?? '')

  const obs = watchers[9]
  await waitFor(() => eventsOf(obs, auction.id, 'TIE_BREAK_START').length, 90_000, 'TIE_BREAK_START')
  const start = eventsOf(obs, auction.id, 'TIE_BREAK_START')[0]
  check(
    'Desempate anunciado com os empatados (ordem de chegada ao valor)',
    start.payload.tiedMembers.map((m) => m.nickname).join(',') === [A, B, D].map((b) => b.nickname).join(','),
    start.payload.tiedMembers.map((m) => m.nickname).join(', '),
  )
  check('Nenhuma seed/vencedor no anúncio', !('seed' in start.payload) && !('winnerId' in start.payload))

  await waitClosed(watchers, auction.id, 60_000)
  const ev = obs.events.get(auction.id)
  const spin = ev.find((e) => e.type === 'TIE_BREAK_SPIN')
  const result = ev.find((e) => e.type === 'TIE_BREAK_RESULT')
  const closed = ev.find((e) => e.type === 'AUCTION_CLOSED')
  check('Contagem de desempate ~5s', Math.abs(spin.at - start.at - 5000) < 700, `${spin.at - start.at}ms`)
  check('Roleta gira ~6s antes do sorteio', Math.abs(result.at - spin.at - 6000) < 700, `${result.at - spin.at}ms`)
  check('Pouso da roleta ~5s antes do nome', Math.abs(closed.at - result.at - 5000) < 700, `${closed.at - result.at}ms`)
  check(
    'TIE_BREAK_RESULT só traz o índice (sem nome/id do vencedor)',
    !('winnerId' in result.payload) && !('winnerNickname' in result.payload),
    JSON.stringify(result.payload),
  )
  // Arrival order (not ms timestamps): nothing received before AUCTION_CLOSED may name the winner.
  const beforeClose = ev.slice(0, ev.indexOf(closed))
  const leaked = beforeClose
    .filter((e) => e.type === 'AUCTION_UPDATE')
    .some((e) => e.payload.auction.winnerId != null || e.payload.auction.winnerNickname != null)
  const leakedChat = beforeClose
    .filter((e) => e.type === 'BOT' || e.type === 'CHAT')
    .some((e) => /Vencedor/.test(e.payload.message.content))
  check('Nome do vencedor NÃO aparece antes da roleta parar', !leaked && !leakedChat)
  const winner = start.payload.tiedMembers[result.payload.winnerIndex]
  check('Vencedor final = segmento sorteado da roleta', closed.payload.winnerId === winner.id, winner.nickname)
  const winnerBot = [A, B, D].find((b) => b.id === winner.id)
  const expected = winnerBot === A ? 450 : 0
  check('Vencedor do desempate debitado em 550', getPoints(winnerBot) === expected, `${winnerBot.nickname}: ${getPoints(winnerBot)} pts`)
}

// ─── Scenario 3: roulette randomness across parallel 3-way ties ──────────────

async function scenarioRandomness(ctx, rounds = 10) {
  console.log(`\n═══ Cenário 3: aleatoriedade da roleta (${rounds} empates triplos em paralelo) ═══`)
  const pool = ctx.bots.slice(10, 10 + rounds * 3)
  pool.forEach((b) => setPoints(b, 100))
  const runs = []
  for (let i = 0; i < rounds; i++) {
    const trio = pool.slice(i * 3, i * 3 + 3)
    const auction = await createAuction(ctx)
    trio.forEach((b) => b.watch(auction.id))
    runs.push({ auction, trio })
  }
  await sleep(300)
  for (const { auction, trio } of runs) {
    for (const b of trio) {
      const r = await b.bid(auction.id, 100)
      if (!r.accepted) check(`Empate all-in ${b.nickname}`, false, r.error)
    }
  }
  const positions = [0, 0, 0]
  for (const { auction, trio } of runs) {
    await waitClosed(trio, auction.id, 120_000)
    const ev = trio[0].events.get(auction.id)
    const idx = ev.find((e) => e.type === 'TIE_BREAK_RESULT')?.payload.winnerIndex
    if (idx != null) positions[idx]++
  }
  check(
    'Sorteio varia entre posições (1º/2º/3º a empatar)',
    positions.filter((n) => n > 0).length >= 2,
    `vitórias por posição: ${positions.join(' / ')}`,
  )
}

// ─── Scenario 4: double-spend + error paths ──────────────────────────────────

async function scenarioErrors(ctx) {
  console.log('\n═══ Cenário 4: gasto duplo entre leilões e erros ═══')
  const E = ctx.bots[4]
  const F = ctx.bots[5]
  setPoints(E, 100)
  setPoints(F, 1000)
  const x = await createAuction(ctx)
  const y = await createAuction(ctx)
  ;[E, F].forEach((b) => {
    b.watch(x.id)
    b.watch(y.id)
  })
  await sleep(300)

  const [rx, ry] = await Promise.all([E.bid(x.id, 100), E.bid(y.id, 100)])
  check(
    'Mesmos 100 pts em 2 leilões simultâneos → só 1 aceito',
    [rx, ry].filter((r) => r.accepted).length === 1,
    [rx, ry].map((r) => (r.accepted ? 'aceito' : r.error)).join(' | '),
  )
  const lostIn = rx.accepted ? y.id : x.id
  const wonIn = rx.accepted ? x.id : y.id
  const fOut = await F.bid(wonIn, 150)
  check('F supera E', fOut.accepted, fOut.error ?? '')
  await sleep(200)
  const eRetry = await E.bid(lostIn, 100)
  check('Reserva de E liberada em tempo real ao ser superado', eRetry.accepted, eRetry.error ?? '')

  const zero = await F.bid(lostIn, 0)
  check('Lance 0 recusado', !zero.accepted, zero.error)
  const ghost = await F.bid(999_999, 10)
  check('Leilão inexistente recusado', !ghost.accepted, ghost.error)

  const anon = await new Promise((resolve) => {
    const c = new Client({
      webSocketFactory: () => new WebSocket(WS_URL),
      heartbeatIncoming: 0,
      heartbeatOutgoing: 0,
      reconnectDelay: 0,
      onConnect: () => c.publish({ destination: `/app/auctions/${x.id}/bid`, body: JSON.stringify({ requestId: 'anon', amount: 5000 }) }),
      onStompError: (f) => resolve(f.headers.message),
      onWebSocketClose: () => resolve('closed'),
    })
    c.activate()
    setTimeout(() => resolve('no-error'), 4000)
  })
  check('Lance via WS sem login é bloqueado', anon !== 'no-error', anon)
  return [x.id, y.id]
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ctx = seed()
console.log(`Conectando ${ctx.bots.length} clientes STOMP em ${WS_URL} …`)
const t0 = Date.now()
await Promise.all(ctx.bots.map((b) => b.connect()))
console.log(`  conectados em ${Date.now() - t0}ms`)

try {
  await scenarioMain(ctx)
  // Tie, randomness and error scenarios use disjoint bots → run concurrently to save time.
  const [, , extra] = await Promise.all([scenarioTie(ctx), scenarioRandomness(ctx), scenarioErrors(ctx)])
  await Promise.all(extra.map((id) => waitClosed([ctx.bots[4]], id, 120_000)))
} catch (err) {
  check('Execução', false, err.stack)
}

await Promise.all(ctx.bots.map((b) => b.disconnect()))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações OK`)
if (failed.length) {
  console.log('FALHAS:')
  failed.forEach((f) => console.log(`  ✘ ${f.name} — ${f.detail}`))
}
process.exit(failed.length ? 1 : 0)
