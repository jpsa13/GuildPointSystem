/**
 * Cria JSON em public/server-info só para tópicos que faltam.
 * NUNCA sobrescreve bodyHtml já traduzido — use --force-bodies só se quiser voltar ao inglês do scrape.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RAW = join(__dirname, '../src/Features/ServerInfo/data/topics.raw.json')
const OUT_DIR = join(__dirname, '../public/server-info/topics')
const INDEX_OUT = join(__dirname, '../public/server-info/index.json')

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

const FORCE_BODIES = process.argv.includes('--force-bodies')

const raw = JSON.parse(readFileSync(RAW, 'utf8'))
mkdirSync(OUT_DIR, { recursive: true })
const index = []
let created = 0
let keptTranslation = 0
let forced = 0

for (const t of raw.topics) {
  const title = titlePtFromEn(t.title)
  const outPath = join(OUT_DIR, `${t.slug}.json`)
  let bodyHtml = t.bodyHtml

  if (existsSync(outPath)) {
    try {
      const existing = JSON.parse(readFileSync(outPath, 'utf8'))
      const translated = existing.bodyHtml && existing.bodyHtml !== t.bodyHtml
      if (translated && !FORCE_BODIES) {
        bodyHtml = existing.bodyHtml
        keptTranslation++
      } else if (FORCE_BODIES) {
        forced++
      }
    } catch {
      /* reescreve com raw */
    }
  } else {
    created++
  }

  writeFileSync(
    outPath,
    JSON.stringify({ slug: t.slug, sourceUrl: t.sourceUrl, title, bodyHtml }),
  )
  index.push({ slug: t.slug, title, sourceUrl: t.sourceUrl })
}
writeFileSync(INDEX_OUT, JSON.stringify({ bootstrappedAt: new Date().toISOString(), topics: index }, null, 2))
console.log(
  `Bootstrap: ${created} novo(s), ${keptTranslation} corpo(s) traduzido(s) preservado(s)` +
    (FORCE_BODIES ? `, ${forced} forçado(s) para inglês` : ''),
)
