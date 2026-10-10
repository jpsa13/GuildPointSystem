/**
 * Parses RF Online server Lua item scripts into Flyway migrations.
 *
 * Filters (equip / accessories): Exist = true AND LevelLim <= 55
 * Other categories: all files (still requires valid Code + Name)
 *
 * Usage:
 *   set RF_LUA_ITEM_DIR=C:\path\to\luaScript\Item
 *   node --max-old-space-size=8192 backend/scripts/generate-lua-item-catalog.mjs
 */
import { readdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const migrationDir = join(root, 'src', 'main', 'resources', 'db', 'migration')

const DEFAULT_LUA_ROOT =
  process.env.RF_LUA_ITEM_DIR ??
  'C:\\Users\\Wesley-PC\\Desktop\\rf-echelon-src\\ServerOutput\\luaScript\\Item'

const MAX_LEVEL_EQUIP = 55
const BATCH_SIZE = 400

/** @type {Record<string, { folder: string, filtered: boolean, sprite: string, cols: number }>} */
const CATEGORIES = {
  WEAPON: { folder: 'Weapon', filtered: true, sprite: '/sprites/weapon.png', cols: 32 },
  HELMET: { folder: 'Helmet', filtered: true, sprite: '/sprites/helmet.png', cols: 32 },
  UPPER: { folder: 'Upper', filtered: true, sprite: '/sprites/upper.png', cols: 32 },
  LOWER: { folder: 'Lower', filtered: true, sprite: '/sprites/lower.png', cols: 32 },
  GLOVES: { folder: 'Gauntlet', filtered: true, sprite: '/sprites/gloves.png', cols: 32 },
  SHOES: { folder: 'Shoe', filtered: true, sprite: '/sprites/shoes.png', cols: 32 },
  AMULET: { folder: 'Amulet', filtered: true, sprite: '/sprites/ringseamulets.png', cols: 128 },
  RING: { folder: 'Ring', filtered: true, sprite: '/sprites/ringseamulets.png', cols: 128 },
  SHIELD: { folder: 'Shield', filtered: true, sprite: '/sprites/shield.png', cols: 8 },
  BOOTY: { folder: 'Booty', filtered: false, sprite: '/sprites/booty.png', cols: 32 },
  BOX: { folder: 'Box', filtered: false, sprite: '/sprites/potion.png', cols: 32 },
  POTION: { folder: 'Potion', filtered: false, sprite: '/sprites/potion.png', cols: 32 },
  RESOURCE: { folder: 'Resource', filtered: false, sprite: '/sprites/resource.png', cols: 16 },
}

function escapeSql(str) {
  return String(str).replace(/'/g, "''")
}

function sqlValue(val) {
  if (val == null) return 'NULL'
  return `'${escapeSql(val)}'`
}

function readExist(content) {
  const exist = content.match(/\bExist\s*=\s*(true|false)/i)
  if (exist) return exist[1].toLowerCase() === 'true'
  const exists = content.match(/\bExists\s*=\s*(true|false)/i)
  if (exists) return exists[1].toLowerCase() === 'true'
  return null
}

function parseLuaFile(content, filtered) {
  const exists = readExist(content)

  const code = content.match(/Code\s*=\s*"([^"]+)"/)?.[1]
  const name = content.match(/Name\s*=\s*"((?:\\.|[^"\\])*)"/)?.[1]?.replace(/\\"/g, '"')
  if (!code || name == null || name.trim() === '') return null

  const gameIndex = parseInt(content.match(/Index\s*=\s*(\d+)/)?.[1] ?? '0', 10) || 0
  const iconIdx = content.match(/IconIDX\s*=\s*(\d+)/)?.[1]
  const iconIdField = content.match(/IconID\s*=\s*(\d+)/)?.[1]
  const iconId = parseInt(iconIdx ?? iconIdField ?? '0', 10) || 0

  const levelLim = content.match(/LevelLim\s*=\s*(-?\d+)/)?.[1]
  const levelMin = content.match(/LevelMin\s*=\s*(-?\d+)/)?.[1]
  const levelRaw = levelLim ?? levelMin
  const levelRequired = levelRaw != null ? parseInt(levelRaw, 10) : 0
  const grade = parseInt(content.match(/ItemGrade\s*=\s*(\d+)/)?.[1] ?? '0', 10) || 0

  if (filtered) {
    if (exists !== true) return null
    if (!Number.isFinite(levelRequired) || levelRequired > MAX_LEVEL_EQUIP) return null
  }

  return { gameIndex, code, name, iconId, levelRequired, grade }
}

function rowToInsert(category, meta, item) {
  return `(${sqlValue(category)}, ${item.gameIndex}, ${sqlValue(item.code)}, ${sqlValue(item.name)}, ${item.iconId}, '${meta.sprite}', ${meta.cols}, ${item.grade}, ${item.levelRequired})`
}

const schemaSql = [
  '-- Lua server item reference catalog (filtered equip <= 55, Exist=true)',
  '',
  'CREATE TABLE game_lua_item (',
  '    id              BIGSERIAL PRIMARY KEY,',
  '    category        VARCHAR(20)  NOT NULL,',
  '    game_index      INT          NOT NULL DEFAULT 0,',
  '    game_code       VARCHAR(50)  NOT NULL,',
  '    name            VARCHAR(200) NOT NULL,',
  '    icon_id         INT          NOT NULL DEFAULT 0,',
  '    sprite_sheet    VARCHAR(500) NOT NULL,',
  '    sprite_cols     INT          NOT NULL DEFAULT 64,',
  '    item_grade      INT          NOT NULL DEFAULT 0,',
  '    level_required  INT          NOT NULL DEFAULT 0,',
  '    CONSTRAINT uq_game_lua_item_category_code UNIQUE (category, game_code),',
  '    CONSTRAINT chk_game_lua_item_category CHECK (category IN (',
  "        'WEAPON', 'HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES',",
  "        'AMULET', 'RING', 'SHIELD', 'BOOTY', 'BOX', 'POTION', 'RESOURCE'",
  '    ))',
  ');',
  '',
  'CREATE INDEX idx_game_lua_item_category_name ON game_lua_item (category, name);',
  'CREATE INDEX idx_game_lua_item_category_level ON game_lua_item (category, level_required);',
  '',
].join('\n')

writeFileSync(join(migrationDir, 'V30__lua_item_catalog_schema.sql'), schemaSql)

const dataPath = join(migrationDir, 'V31__lua_item_catalog_data.sql')
writeFileSync(
  dataPath,
  [
    '-- game_lua_item seed from RF server Lua scripts',
    '',
    'ALTER TABLE game_lua_item DROP CONSTRAINT IF EXISTS uq_game_lua_item_code;',
    'ALTER TABLE game_lua_item DROP CONSTRAINT IF EXISTS uq_game_lua_item_category_code;',
    'ALTER TABLE game_lua_item ADD CONSTRAINT uq_game_lua_item_category_code UNIQUE (category, game_code);',
    '',
    'TRUNCATE game_lua_item RESTART IDENTITY;',
    '',
  ].join('\n'),
)

const columns =
  'category, game_index, game_code, name, icon_id, sprite_sheet, sprite_cols, item_grade, level_required'

let total = 0
const stats = {}
const seenKeys = new Set()

for (const [category, meta] of Object.entries(CATEGORIES)) {
  const dir = join(DEFAULT_LUA_ROOT, meta.folder)
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lua'))
  } catch {
    console.warn(`Skip missing folder: ${dir}`)
    stats[category] = 0
    continue
  }

  const batch = []
  let included = 0
  let scanned = 0

  for (const file of files) {
    scanned++
    const content = readFileSync(join(dir, file), 'utf8')
    const item = parseLuaFile(content, meta.filtered)
    if (!item) continue
    const dedupeKey = `${category}:${item.code}`
    if (seenKeys.has(dedupeKey)) continue
    seenKeys.add(dedupeKey)
    batch.push(rowToInsert(category, meta, item))
    included++

    if (batch.length >= BATCH_SIZE) {
      appendFileSync(
        dataPath,
        `INSERT INTO game_lua_item (${columns}) VALUES\n${batch.join(',\n')};\n\n`,
      )
      batch.length = 0
    }
  }

  if (batch.length > 0) {
    appendFileSync(
      dataPath,
      `INSERT INTO game_lua_item (${columns}) VALUES\n${batch.join(',\n')};\n\n`,
    )
  }

  stats[category] = included
  total += included
  console.log(`${category}: ${included} / ${scanned} files`)
}

console.log(`\nTotal rows: ${total}`)
console.log('Wrote V30__lua_item_catalog_schema.sql and V31__lua_item_catalog_data.sql')
