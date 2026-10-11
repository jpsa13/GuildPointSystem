/**
 * News API checks (permissions, XSS sanitization, ordering, edit stamps, live event) against the
 * isolated stress backend (8081). Run from frontend/: node scripts/news-test.mjs
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

sql('DELETE FROM news')
const admin = Number(sql(`SELECT id FROM member WHERE email = 'stress_admin@test'`))
const member = Number(sql(`SELECT id FROM member WHERE role = 'MEMBRO' AND status = 'APROVADO' ORDER BY id LIMIT 1`))

let events = 0
const ws = new Client({
  webSocketFactory: () => new WebSocket(WS_URL),
  connectHeaders: { Authorization: `Bearer ${jwt(member)}` },
  heartbeatIncoming: 0, heartbeatOutgoing: 0, reconnectDelay: 0,
})
await new Promise((resolve) => {
  ws.onConnect = () => { ws.subscribe('/topic/news', () => events++); resolve() }
  ws.activate()
})

console.log('\n═══ Permissões ═══')
let r = await api(member, 'POST', '/news', { title: 'x', contentHtml: '<p>x</p>' })
check('Membro comum NÃO publica', r.status === 403, `HTTP ${r.status}`)
r = await api(admin, 'POST', '/news', { title: '', contentHtml: '<p>x</p>' })
check('Título obrigatório', r.status === 400, r.data?.message)
r = await api(admin, 'POST', '/news', { title: 'Vazia', contentHtml: '<p></p><p> </p>' })
check('Conteúdo vazio recusado', r.status === 400, r.data?.message)

console.log('\n═══ Sanitização (XSS) ═══')
const evil = '<h2>Título</h2><p onclick="alert(1)">Olá <strong>guild</strong> <a href="javascript:alert(1)">ruim</a> ' +
  '<a href="https://rf.example">bom</a></p><script>alert(1)</script><img src=x onerror=alert(1)>' +
  '<iframe src="https://evil"></iframe><p style="color:red">estilo</p><ul><li>item</li></ul>'
r = await api(admin, 'POST', '/news', { title: 'Primeira', contentHtml: evil })
check('Administrador publica', r.status === 201, `HTTP ${r.status}`)
const html = r.data.contentHtml
check('<script> removido', !/<script/i.test(html))
check('onclick/onerror removidos', !/on(click|error)=/i.test(html))
check('<img>/<iframe> removidos', !/<(img|iframe)/i.test(html))
check('link javascript: neutralizado', !/javascript:/i.test(html))
check('style inline removido', !/style=/i.test(html))
check('Formatação permitida mantida (h2, strong, ul/li, link https)',
  /<h2>/.test(html) && /<strong>guild<\/strong>/.test(html) && /<li>item<\/li>/.test(html) && /href="https:\/\/rf\.example"/.test(html))
check('Links externos abrem em nova aba com rel seguro', /target="_blank"/.test(html) && /rel="noopener noreferrer nofollow"/.test(html))
const firstId = r.data.id
await sleep(50)
r = await api(admin, 'POST', '/news', { title: 'Segunda', contentHtml: '<p>mais nova</p>' })
const secondId = r.data.id

console.log('\n═══ Ordem e paginação ═══')
r = await api(member, 'GET', '/news?page=0&size=1')
check('Página 1 = notícia mais recente', r.data.content[0]?.id === secondId, r.data.content[0]?.title)
check('Total e páginas corretos', r.data.totalElements === 2 && r.data.totalPages === 2)
r = await api(member, 'GET', '/news?page=1&size=1')
check('Página 2 = anterior', r.data.content[0]?.id === firstId)

console.log('\n═══ Edição e exclusão ═══')
r = await api(member, 'PUT', `/news/${firstId}`, { title: 'hack', contentHtml: '<p>x</p>' })
check('Membro comum NÃO edita', r.status === 403)
r = await api(admin, 'PUT', `/news/${firstId}`, { title: 'Primeira (editada)', contentHtml: '<p>novo texto</p>' })
check('Edição grava data e autor da edição', r.status === 200 && !!r.data.updatedAt && !!r.data.editorNickname,
  `${r.data.updatedAt} por ${r.data.editorNickname}`)
check('Data de publicação original preservada', r.data.createdAt && new Date(r.data.createdAt) < new Date(r.data.updatedAt))
r = await api(member, 'DELETE', `/news/${secondId}`)
check('Membro comum NÃO exclui', r.status === 403)
r = await api(admin, 'DELETE', `/news/${secondId}`)
check('Administrador exclui', r.status === 204)
r = await api(member, 'GET', '/news?page=0&size=1')
check('Lista atualizada após excluir', r.data.totalElements === 1 && r.data.content[0].id === firstId)
check('Logs de auditoria (publicada/editada/excluída)',
  Number(sql(`SELECT count(*) FROM audit_log WHERE type IN ('NEWS_CREATED','NEWS_UPDATED','NEWS_DELETED')
    AND (payload->>'newsId')::bigint IN (${firstId}, ${secondId})`)) === 4)

await sleep(300)
check('Eventos WS recebidos (2 publicações + 1 edição + 1 exclusão)', events === 4, `${events} eventos`)
await ws.deactivate()
console.log(failed ? `\n${failed} falha(s)` : '\nTudo OK')
process.exit(failed ? 1 : 0)
