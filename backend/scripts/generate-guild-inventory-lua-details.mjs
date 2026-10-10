/**
 * Enriches guild item_weapon / item_armor stats from server Lua scripts.
 * Run after V41 (inventory rows exist). Writes Flyway migration V42.
 *
 *   set RF_LUA_ITEM_DIR=C:\path\to\luaScript\Item
 *   node backend/scripts/generate-guild-inventory-lua-details.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationDir = join(__dirname, '..', 'src', 'main', 'resources', 'db', 'migration')

const DEFAULT_LUA_ROOT =
  process.env.RF_LUA_ITEM_DIR ??
  'C:\\Users\\Wesley-PC\\Desktop\\rf-echelon-src\\ServerOutput\\luaScript\\Item'

// Indexed by the Lua `Type` field (0-based, verified against item names/codes; crossbows are Type 5).
const WEAPON_SUBTYPES = [
  'Knife', // 0
  'Sword', // 1
  'Axe', // 2
  'Mace', // 3
  'Spear', // 4
  'Bow', // 5
  'Firearm', // 6
  'Launcher', // 7
  'Throwing Knife', // 8
  'Staff', // 9
  'Mining Tool', // 10
  'Grenade Launcher', // 11
]

const CATEGORIES = {
  WEAPON: { folder: 'Weapon', filtered: true, kind: 'weapon' },
  HELMET: { folder: 'Helmet', filtered: true, kind: 'armor' },
  UPPER: { folder: 'Upper', filtered: true, kind: 'armor' },
  LOWER: { folder: 'Lower', filtered: true, kind: 'armor' },
  GLOVES: { folder: 'Gauntlet', filtered: true, kind: 'armor' },
  SHOES: { folder: 'Shoe', filtered: true, kind: 'armor' },
  SHIELD: { folder: 'Shield', filtered: true, kind: 'armor' },
}

const MAX_LEVEL = 55
const BATCH = 300

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

function intField(content, name, fallback = 0) {
  const m = content.match(new RegExp(`\\b${name}\\s*=\\s*(-?\\d+)`))
  return m ? parseInt(m[1], 10) : fallback
}

function parseWeapon(content, filtered) {
  if (filtered && readExist(content) !== true) return null
  const code = content.match(/Code\s*=\s*"([^"]+)"/)?.[1]
  if (!code) return null
  const levelLim = intField(content, 'LevelLim', intField(content, 'LevelMin', 0))
  if (filtered && levelLim > MAX_LEVEL) return null

  const typeIdx = intField(content, 'Type', -1)
  const subtype = WEAPON_SUBTYPES[typeIdx] ?? 'Unknown'

  return {
    code: code.toLowerCase(),
    level: Math.max(levelLim, 0),
    subtype,
    attackMin: intField(content, 'GAMinAF', 0),
    attackMax: intField(content, 'GAMaxAF', 0),
    forceMin: intField(content, 'MAMinAF', 0),
    forceMax: intField(content, 'MAMaxAF', 0),
  }
}

function parseArmor(content, filtered, slot) {
  if (filtered && readExist(content) !== true) return null
  const code = content.match(/Code\s*=\s*"([^"]+)"/)?.[1]
  if (!code) return null
  const levelLim = intField(content, 'LevelLim', intField(content, 'LevelMin', 0))
  if (filtered && levelLim > MAX_LEVEL) return null

  const def = intField(content, 'DefFc', intField(content, 'Def', 0))
  const defRate = intField(content, 'DefGap', 0)

  return {
    code: code.toLowerCase(),
    level: Math.max(levelLim, 0),
    subtype: slot,
    avgDefPower: def,
    defenseSuccessRate: defRate,
  }
}

const outPath = join(migrationDir, 'V42__guild_inventory_lua_weapon_armor_stats.sql')
const lines = [
  '-- Weapon/armor stats parsed from RF server Lua (generate-guild-inventory-lua-details.mjs)',
  '',
  'CREATE TEMP TABLE IF NOT EXISTS _guild_weapon_stats (',
  '  game_code VARCHAR(50) PRIMARY KEY,',
  '  level INT NOT NULL,',
  '  subtype VARCHAR(50) NOT NULL,',
  '  attack_min INT NOT NULL,',
  '  attack_max INT NOT NULL,',
  '  force_min INT NOT NULL,',
  '  force_max INT NOT NULL',
  ');',
  '',
  'CREATE TEMP TABLE IF NOT EXISTS _guild_armor_stats (',
  '  game_code VARCHAR(50) PRIMARY KEY,',
  '  level INT NOT NULL,',
  '  subtype VARCHAR(50) NOT NULL,',
  '  avg_def_power INT NOT NULL,',
  '  defense_success_rate INT NOT NULL',
  ');',
  '',
]

const weaponByCode = new Map()
const armorByCode = new Map()
let weaponRows = []
let armorRows = []

for (const [slot, meta] of Object.entries(CATEGORIES)) {
  const dir = join(DEFAULT_LUA_ROOT, meta.folder)
  let files = []
  try {
    files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.lua'))
  } catch {
    console.warn(`Skip missing folder: ${dir}`)
    continue
  }

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf8')
    if (meta.kind === 'weapon') {
      const row = parseWeapon(content, meta.filtered)
      if (row && !weaponByCode.has(row.code)) weaponByCode.set(row.code, row)
    } else {
      const row = parseArmor(content, meta.filtered, slot)
      if (row && !armorByCode.has(row.code)) armorByCode.set(row.code, row)
    }
  }
  console.log(`${slot}: parsed`)
}

weaponRows = [...weaponByCode.values()]
armorRows = [...armorByCode.values()]

function flushWeaponBatch(batch) {
  if (batch.length === 0) return
  const values = batch
    .map(
      (r) =>
        `('${escapeSql(r.code)}', ${r.level}, '${escapeSql(r.subtype)}', ${r.attackMin}, ${r.attackMax}, ${r.forceMin}, ${r.forceMax})`,
    )
    .join(',\n')
  lines.push(`INSERT INTO _guild_weapon_stats VALUES\n${values}\nON CONFLICT (game_code) DO UPDATE SET
  level = EXCLUDED.level,
  subtype = EXCLUDED.subtype,
  attack_min = EXCLUDED.attack_min,
  attack_max = EXCLUDED.attack_max,
  force_min = EXCLUDED.force_min,
  force_max = EXCLUDED.force_max;\n`)
}

function flushArmorBatch(batch) {
  if (batch.length === 0) return
  const values = batch
    .map(
      (r) =>
        `('${escapeSql(r.code)}', ${r.level}, '${escapeSql(r.subtype)}', ${r.avgDefPower}, ${r.defenseSuccessRate})`,
    )
    .join(',\n')
  lines.push(`INSERT INTO _guild_armor_stats VALUES\n${values}\nON CONFLICT (game_code) DO UPDATE SET
  level = EXCLUDED.level,
  subtype = EXCLUDED.subtype,
  avg_def_power = EXCLUDED.avg_def_power,
  defense_success_rate = EXCLUDED.defense_success_rate;\n`)
}

for (let i = 0; i < weaponRows.length; i += BATCH) {
  flushWeaponBatch(weaponRows.slice(i, i + BATCH))
}
for (let i = 0; i < armorRows.length; i += BATCH) {
  flushArmorBatch(armorRows.slice(i, i + BATCH))
}

lines.push(`
UPDATE item_weapon w
SET
  level = s.level,
  subtype = s.subtype,
  attack_min = s.attack_min,
  attack_max = s.attack_max,
  force_attack_min = s.force_min,
  force_attack_max = s.force_max
FROM item i
JOIN _guild_weapon_stats s ON LOWER(i.game_code) = s.game_code
WHERE w.item_id = i.id AND i.deleted = FALSE;

UPDATE item_armor a
SET
  level = s.level,
  subtype = s.subtype,
  avg_def_power = s.avg_def_power,
  defense_success_rate = s.defense_success_rate
FROM item i
JOIN _guild_armor_stats s ON LOWER(i.game_code) = s.game_code
WHERE a.item_id = i.id AND i.deleted = FALSE;

DROP TABLE IF EXISTS _guild_weapon_stats;
DROP TABLE IF EXISTS _guild_armor_stats;
`)

writeFileSync(outPath, lines.join('\n'))
console.log(`Wrote ${outPath} (${weaponRows.length} weapons, ${armorRows.length} armor pieces)`)
