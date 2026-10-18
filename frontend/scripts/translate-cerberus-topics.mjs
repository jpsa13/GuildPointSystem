/**
 * Translates scraped forum HTML to Portuguese (leaf text elements only).
 * Run: node scripts/translate-cerberus-topics.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as cheerio from 'cheerio'
import translate from 'google-translate-api-x'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW = join(__dirname, '../src/Features/ServerInfo/data/topics.raw.json')
const OUT_DIR = join(__dirname, '../public/server-info/topics')
const INDEX_OUT = join(__dirname, '../public/server-info/index.json')
const CACHE = join(__dirname, '../src/Features/ServerInfo/data/translate-cache.json')

/** Slugs opcionais: node scripts/translate-cerberus-topics.mjs --only=slug1,slug2 */
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY_SLUGS = onlyArg
  ? new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean))
  : null

/** Pula corpo se já foi traduzido (differe do scrape raw). Use --force para reprocessar tudo. */
const FORCE = process.argv.includes('--force')

const LEAF_SELECTORS =
  'p, li, td, th, h1, h2, h3, h4, h5, h6, b, strong, i, em, u, span, div.bbCodeBlock-title, button.bbCodeSpoiler-button'

const PROTECT = [
  'Quests',
  'Quest',
  'Accretia',
  'Bellato',
  'Cora',
  'MAU',
  'Chip War',
  'Web-Auction',
  'Guild Points',
  'Guild Store',
  'Guild skills',
  'Premium Service',
  'Cash shop',
  'Hero Path',
  'Paragons',
  'Cartella',
  'Adventurer',
  'ExitLag',
  'CBT',
  'PvP',
  'RF Online',
  'FORCE & STEEL',
  'CERBERUS GAMES Inc',
  'Desert of Hunters',
  'Charshop',
  'Relics',
  'Rifts',
  'Dungeon Turrets',
  'Server Box',
  'Race Leader',
  'New Locations',
  'Gathering Resources',
  'Dodge',
  'Accuracy',
  'PrecisionAccuracy',
  'Level Drop System',
  'Catching-up-system',
  'Class Balance',
  'Solo BD',
]

function protectText(text) {
  let out = text
  const tokens = []
  PROTECT.forEach((term, i) => {
    const token = `⟦P${i}⟧`
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    if (re.test(out)) {
      tokens.push({ token, term })
      out = out.replace(re, token)
    }
  })
  return { text: out, tokens }
}

function restoreText(text, tokens) {
  let out = text
  for (const { token, term } of tokens) {
    out = out.split(token).join(term)
  }
  return out
}

function titlePtFromEn(title) {
  return title
    .replace(/^Важно\s*-\s*/i, '')
    .replace(/^\[Alpha Server information\]\s*/i, '[Informações do servidor Alpha] ')
    .replace(/^\[Server [Ii]nformation\]\s*/i, '[Informações do servidor] ')
    .replace(/^\[Server information\]\s*/i, '[Informações do servidor] ')
    .replace(/General information/i, 'Informações gerais')
    .replace(/All New Quests/i, 'Todas as novas Quests')
    .replace(/Solo BD quests/i, 'Solo BD Quests')
    .replace(/Relics \/ Relics Upgrade/i, 'Relics / Upgrade de Relics')
    .replace(
      /Guild Progression System \(Guild Points, Guild Store, Guild skills\)/i,
      'Sistema de progressão da Guild (Guild Points, Guild Store, Guild skills)',
    )
    .replace(/GATHERING RESOURCES \(Flower, Cactus, Ore\)/i, 'COLETA DE RECURSOS (Flower, Cactus, Ore)')
    .replace(/Classes 30 and 40 Level/i, 'Classes nível 30 e 40')
    .replace(/Chip War and Ore/i, 'Chip War e Ore')
    .replace(/Race Leader Voting system/i, 'Sistema de votação do líder da raça')
    .replace(/New Locations/i, 'Novos locais')
    .replace(/MAU Changes/i, 'Alterações de MAU')
    .replace(/PvP Point Gain System/i, 'Sistema de ganho de pontos PvP')
    .replace(/Class Balance Changes/i, 'Alterações de balanceamento de classes')
    .replace(/Equipment Stats/i, 'Atributos de equipamentos')
    .replace(/Craft and Upgrades for EQUIPMENT/i, 'Craft e upgrades de EQUIPAMENTOS')
    .replace(/Craft and Combination for RESOURCES/i, 'Craft e combinação de RECURSOS')
    .replace(/Global Event - Battle for Ether/i, 'Evento global - Batalha por Ether')
    .replace(/Monsters - Heroic/i, 'Monstros - Heroic')
    .replace(/Phase 1\. Stages of 1st phase\./i, 'Fase 1. Etapas da 1ª fase.')
}

let cache = {}
if (existsSync(CACHE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE, 'utf8'))
  } catch {
    cache = {}
  }
}

/** Batch API costuma levar a 429; uma string por requisição é mais lento mas estável. */
const TRANSLATE_OPTS = { from: 'en', to: 'pt', client: 'gtx', forceBatch: false }
const REQUEST_PAUSE_MS = 900

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function callTranslate(input) {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await translate(input, TRANSLATE_OPTS)
    } catch (e) {
      const msg = String(e?.message ?? e)
      // "Partial Translation Request Fail" is a transient rejection too: the same string succeeds on retry.
      const rate =
        msg.includes('429') || msg.includes('Too Many') || msg.includes('sorry/index') ||
        msg.includes('Partial Translation Request Fail')
      if (!rate || attempt === 11) throw e
      const wait = Math.min(300_000, 15_000 * 2 ** attempt)
      console.warn(`  rate limit — pausa ${Math.round(wait / 1000)}s (tentativa ${attempt + 1}/12)`)
      await sleep(wait)
    }
  }
  throw new Error('callTranslate: unreachable')
}

function applyCachedText(text) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const hit = cache[trimmed]
  if (!hit) return text
  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  return leading + hit + trailing
}

async function ensureCacheForStrings(uniqueTrimmed, onProgress) {
  const pending = uniqueTrimmed.filter((s) => !cache[s])
  if (pending.length === 0) return

  for (let i = 0; i < pending.length; i++) {
    const trimmed = pending[i]
    const { text: protectedText, tokens } = protectText(trimmed)
    const res = await callTranslate(protectedText)
    cache[trimmed] = restoreText(res.text, tokens)
    if (i % 15 === 0 || i + 1 === pending.length) {
      writeFileSync(CACHE, JSON.stringify(cache), 'utf8')
    }
    if (onProgress && (i === 0 || (i + 1) % 25 === 0 || i + 1 === pending.length)) {
      onProgress(i + 1, pending.length, 'strings')
    }
    await sleep(REQUEST_PAUSE_MS)
  }
}

async function translateHtml(html, onProgress) {
  const $ = cheerio.load(`<div id="wrap">${html}</div>`, { decodeEntities: false }, false)
  const elements = $(LEAF_SELECTORS).toArray()
  const work = []
  for (const el of elements) {
    const $el = $(el)
    if ($el.closest('.bbImageWrapper, img, script, style, nav.rf-stage-nav').length) continue
    if ($el.find('img, table, ul, ol, .bbImageWrapper').length) continue
    const text = $el.text()
    if (!text.trim()) continue
    work.push({ el, text })
  }

  const unique = [...new Set(work.map((w) => w.text.trim()))]
  await ensureCacheForStrings(unique, (done, total) => {
    if (onProgress) onProgress(done, total, 'strings')
  })

  for (const { el, text } of work) {
    $(el).text(applyCachedText(text))
  }

  // Second pass: loose text next to images/lists/tables (e.g. `<li><img> Added new PVE buff…</li>`)
  // whose element the leaf pass skipped as a whole, plus the section-nav link labels (text only, so
  // the anchors keep working).
  const handled = new Set(work.map((w) => w.el))
  const looseNodes = []
  $('#wrap *').each((_, el) => {
    if (['script', 'style'].includes(el.tagName)) return
    if ($(el).closest('.bbImageWrapper').length) return
    if ($(el).parents().toArray().some((p) => handled.has(p)) || handled.has(el)) return
    for (const node of el.children ?? []) {
      if (node.type === 'text' && /[A-Za-z]{2}/.test(node.data)) looseNodes.push(node)
    }
  })
  await ensureCacheForStrings([...new Set(looseNodes.map((n) => n.data.trim()))], (done, total) => {
    if (onProgress) onProgress(done, total, 'trechos soltos')
  })
  for (const node of looseNodes) node.data = applyCachedText(node.data)

  return replaceForumUiLabels($('#wrap').html() ?? '')
}

/** XenForo UI strings the forum renders in Russian; they are markup, not post text, so the translator never sees them. */
const FORUM_UI_LABELS = [
  ['Нажмите для открытия или закрытия спойлера', 'Clique para abrir ou fechar o spoiler'],
  ['Посмотреть вложение', 'Ver anexo'],
  ['Спойлер:', 'Spoiler:'],
]

function replaceForumUiLabels(html) {
  return FORUM_UI_LABELS.reduce((out, [ru, pt]) => out.split(ru).join(pt), html)
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const raw = JSON.parse(readFileSync(RAW, 'utf8'))
  const index = []

  const topics = ONLY_SLUGS
    ? raw.topics.filter((t) => ONLY_SLUGS.has(t.slug))
    : raw.topics

  if (ONLY_SLUGS && topics.length === 0) {
    console.error('Nenhum slug encontrado em --only=')
    process.exit(1)
  }

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i]
    console.log(`[${i + 1}/${topics.length}] ${t.slug}`)
    try {
    const titlePt = titlePtFromEn(t.title)
    const outPath = join(OUT_DIR, `${t.slug}.json`)
    let existingBody = null
    if (!FORCE && existsSync(outPath)) {
      try {
        existingBody = JSON.parse(readFileSync(outPath, 'utf8')).bodyHtml
      } catch {
        existingBody = null
      }
    }
    const alreadyTranslated = existingBody != null && existingBody !== t.bodyHtml
    const bodyHtmlPt = alreadyTranslated && !FORCE
      ? existingBody
      : await translateHtml(t.bodyHtml, (done, total, kind = 'blocos') => {
          console.log(`  … ${done}/${total} ${kind}`)
        })
    if (alreadyTranslated && !FORCE) {
      console.log(`  (corpo já traduzido — pulando)`)
    }
    writeFileSync(
      join(OUT_DIR, `${t.slug}.json`),
      JSON.stringify({ slug: t.slug, sourceUrl: t.sourceUrl, title: titlePt, bodyHtml: bodyHtmlPt }),
      'utf8',
    )
    index.push({ slug: t.slug, title: titlePt, sourceUrl: t.sourceUrl })
    writeFileSync(CACHE, JSON.stringify(cache), 'utf8')
    } catch (e) {
      console.error(`  ERRO em ${t.slug}:`, e?.message ?? e)
      console.error('  Tópicos já gravados foram preservados. Rode de novo para continuar.')
      process.exit(1)
    }
  }

  if (!ONLY_SLUGS) {
    writeFileSync(
      INDEX_OUT,
      JSON.stringify({ translatedAt: new Date().toISOString(), topics: index }, null, 2),
      'utf8',
    )
  } else {
    const prev = existsSync(INDEX_OUT) ? JSON.parse(readFileSync(INDEX_OUT, 'utf8')) : { topics: [] }
    const bySlug = new Map((prev.topics ?? []).map((x) => [x.slug, x]))
    for (const row of index) bySlug.set(row.slug, row)
    writeFileSync(
      INDEX_OUT,
      JSON.stringify(
        { translatedAt: new Date().toISOString(), topics: [...bySlug.values()].sort((a, b) => a.title.localeCompare(b.title)) },
        null,
        2,
      ),
      'utf8',
    )
  }
  console.log(`Wrote ${index.length} topic(s) to ${OUT_DIR}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
