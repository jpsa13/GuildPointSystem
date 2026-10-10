/**
 * Parses Effects = { { id, value }, ... } from item Lua scripts into item special_effects JSON.
 *
 *   node backend/scripts/generate-guild-inventory-lua-effects.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

import { formatLuaItemEffect, loadLuaEffectCatalog } from './load-lua-effect-catalog.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationDir = join(__dirname, '..', 'src', 'main', 'resources', 'db', 'migration')

const DEFAULT_LUA_ROOT =
  process.env.RF_LUA_ITEM_DIR ??
  'C:\\Users\\Wesley-PC\\Desktop\\rf-echelon-src\\ServerOutput\\luaScript\\Item'

const MAX_LEVEL_EQUIP = 55
const BATCH = 250

const CATEGORIES = {
  WEAPON: { folder: 'Weapon', filtered: true, tables: ['item_weapon'] },
  HELMET: { folder: 'Helmet', filtered: true, tables: ['item_armor'] },
  UPPER: { folder: 'Upper', filtered: true, tables: ['item_armor'] },
  LOWER: { folder: 'Lower', filtered: true, tables: ['item_armor'] },
  GLOVES: { folder: 'Gauntlet', filtered: true, tables: ['item_armor'] },
  SHOES: { folder: 'Shoe', filtered: true, tables: ['item_armor'] },
  SHIELD: { folder: 'Shield', filtered: true, tables: ['item_armor'] },
  AMULET: { folder: 'Amulet', filtered: true, tables: ['item_accessory'] },
  RING: { folder: 'Ring', filtered: true, tables: ['item_accessory'] },
  BOOTY: { folder: 'Booty', filtered: false, tables: [] },
  BOX: { folder: 'Box', filtered: false, tables: [] },
  POTION: { folder: 'Potion', filtered: false, tables: [] },
  RESOURCE: { folder: 'Resource', filtered: false, tables: [] },
}

function escapeSql(str) {
  return String(str).replace(/'/g, "''")
}

function readExist(content) {
  const exist = content.match(/\bExist\s*=\s*(true|false)/i)
  if (exist) return exist[1].toLowerCase() === 'true'
  const exists = content.match(/\bExists\s*=\s*(true|false)/i)
  if (exists) return exists[1].toLowerCase() === 'true'
  return null
}

function parseEffectsBlock(content) {
  const marker = content.match(/\bEffects\s*=\s*\{/)
  if (!marker) return []

  const start = marker.index + marker[0].length
  let depth = 1
  let i = start
  while (i < content.length && depth > 0) {
    const ch = content[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  const inner = content.slice(start, i - 1)
  const pairs = []
  const re = /\{\s*(\d+)\s*,\s*(-?\d+(?:\.\d+)?)\s*\}/g
  let m
  while ((m = re.exec(inner))) {
    pairs.push({ effectId: parseInt(m[1], 10), value: parseFloat(m[2]) })
  }
  return pairs
}

function parseFile(content, filtered, effectCatalog) {
  if (filtered && readExist(content) !== true) return null
  const code = content.match(/Code\s*=\s*"([^"]+)"/)?.[1]
  if (!code) return null
  const levelLim = content.match(/LevelLim\s*=\s*(-?\d+)/)?.[1]
  const levelMin = content.match(/LevelMin\s*=\s*(-?\d+)/)?.[1]
  const level = parseInt(levelLim ?? levelMin ?? '0', 10)
  if (filtered && level > MAX_LEVEL_EQUIP) return null

  const effects = parseEffectsBlock(content)
  if (effects.length === 0) return null

  const labels = effects
    .map(({ effectId, value }) => formatLuaItemEffect(effectCatalog.get(effectId), value))
    .filter(Boolean)
    .slice(0, 4)

  if (labels.length === 0) return null

  const json = JSON.stringify(labels)
  return { code: code.toLowerCase(), json }
}

const effectCatalog = loadLuaEffectCatalog()
console.log(`Effect catalog: ${effectCatalog.size} definitions`)

const byCode = new Map()

for (const [category, meta] of Object.entries(CATEGORIES)) {
  const dir = join(DEFAULT_LUA_ROOT, meta.folder)
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lua'))
  } catch {
    console.warn(`Skip ${category}: missing ${dir}`)
    continue
  }

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf8')
    const row = parseFile(content, meta.filtered, effectCatalog)
    if (row && !byCode.has(row.code)) byCode.set(row.code, row)
  }
  console.log(`${category}: scanned`)
}

const rows = [...byCode.values()]
console.log(`Items with effects: ${rows.length}`)

const outPath = join(migrationDir, 'V43__guild_inventory_lua_item_effects.sql')
const lines = [
  '-- Item special_effects from Lua Effects = { { catalogId, value }, ... }',
  '',
  'CREATE TEMP TABLE _guild_item_effects (',
  '  game_code VARCHAR(50) PRIMARY KEY,',
  '  special_effects JSONB NOT NULL',
  ');',
  '',
]

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const values = batch
    .map((r) => `('${escapeSql(r.code)}', '${escapeSql(r.json)}'::jsonb)`)
    .join(',\n')
  lines.push(
    `INSERT INTO _guild_item_effects (game_code, special_effects) VALUES\n${values}\nON CONFLICT (game_code) DO UPDATE SET special_effects = EXCLUDED.special_effects;\n`,
  )
}

lines.push(`
UPDATE item_weapon w
SET special_effects = e.special_effects
FROM item i
JOIN _guild_item_effects e ON LOWER(i.game_code) = e.game_code
WHERE w.item_id = i.id AND i.deleted = FALSE;

UPDATE item_armor a
SET special_effects = e.special_effects
FROM item i
JOIN _guild_item_effects e ON LOWER(i.game_code) = e.game_code
WHERE a.item_id = i.id AND i.deleted = FALSE;

UPDATE item_accessory ac
SET special_effects = e.special_effects
FROM item i
JOIN _guild_item_effects e ON LOWER(i.game_code) = e.game_code
WHERE ac.item_id = i.id AND i.deleted = FALSE;

DROP TABLE IF EXISTS _guild_item_effects;
`)

writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath}`)
