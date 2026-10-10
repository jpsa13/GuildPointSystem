/**
 * Parses WeaponItem*.xlsx and writes Flyway migrations (LevelLim >= 35 only).
 * Usage: node --max-old-space-size=8192 backend/scripts/generate-weapon-seeds.mjs
 */
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const xlsxDir = join(root, 'xlsx')
const migrationDir = join(root, 'src', 'main', 'resources', 'db', 'migration')

const MIN_LEVEL = 35
const BATCH_SIZE = 200
const SPRITE = '/sprites/weapon.png'
const SPRITE_COLS = 32

const WEAPON_FILES = ['WeaponItem.xlsx', 'WeaponItema.xlsx', 'WeaponItemb.xlsx']

const WEAPON_TYPES = {
  0: 'KNIFE',
  1: 'SWORD',
  2: 'AXE',
  3: 'HAMMER',
  4: 'SPEAR',
  5: 'BOW',
  6: 'FIREARM',
  7: 'LAUNCHER',
  8: 'THROWING_KNIFE',
  9: 'STAFF',
  10: 'MINING_TOOL',
  11: 'GRENADE_LAUNCHER',
}

const WEAPON_TYPE_CHECK = Object.values(WEAPON_TYPES)
  .map((t) => `'${t}'`)
  .join(', ')

function escapeSql(str) {
  return String(str).replace(/'/g, "''")
}

function sqlValue(val) {
  if (val == null || val === '') return 'NULL'
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL'
  return `'${escapeSql(val)}'`
}

function sqlNum(val) {
  if (val == null || val === '') return 'NULL'
  const n = Number(val)
  if (!Number.isFinite(n) || n === 0) return 'NULL'
  return String(n)
}

function sqlInt(val, defaultVal = 0) {
  if (val == null || val === '') return String(defaultVal)
  const n = parseInt(val, 10)
  return String(Number.isFinite(n) ? n : defaultVal)
}

function readSheetRows(filePath) {
  const buf = readFileSync(filePath)
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  let headerRowIdx = raw.findIndex((row) =>
    Array.isArray(row) && row.some((c) => c === 'IsExist')
  )
  if (headerRowIdx < 0) headerRowIdx = 1

  const headers = raw[headerRowIdx] ?? []
  return raw.slice(headerRowIdx + 1).map((row) => {
    const obj = {}
    headers.forEach((h, i) => {
      if (h) obj[h] = row[i]
    })
    return obj
  })
}

function weaponTypeFromRow(row) {
  const typeNum = parseInt(row.Type ?? row.type ?? -1, 10)
  return WEAPON_TYPES[typeNum] ?? null
}

function canonicalCivil(civil) {
  const trimmed = String(civil ?? '11111').trim()
  const legacyToCompact = {
    '11111000': '11111',
    '11110000': '11110',
    '11000000': '11000',
    '00110000': '00110',
    '00001000': '00001',
  }
  if (legacyToCompact[trimmed]) return legacyToCompact[trimmed]
  if (trimmed.length >= 8) {
    const padded = trimmed.slice(0, 8).padEnd(8, '0')
    return legacyToCompact[padded] ?? trimmed
  }
  return trimmed
}

function rowToInsert(row) {
  const gameCode = row.Code ?? row.code
  const name = row.Name ?? row.name
  const weaponType = weaponTypeFromRow(row)
  const iconId = sqlInt(row.Icon ?? row.IconID ?? row.iconID, 0)
  const grade = sqlInt(row.Grade ?? row.ItemGrade ?? row.itemGrade, 0)
  const civil = canonicalCivil(row.Civil ?? row.civil ?? '11111')
  const levelLim = parseInt(row.LevelLim ?? row.LvLim ?? 0, 10) || 0

  return `(${sqlValue(gameCode)}, ${sqlValue(name)}, '${weaponType}', ${iconId}, '${SPRITE}', ${SPRITE_COLS}, ${grade}, '${escapeSql(String(civil))}', ${levelLim}, ${sqlInt(row.GAMinAF ?? row.gaMinAF, 0)}, ${sqlInt(row.GAMaxAF ?? row.gaMaxAF, 0)}, ${sqlInt(row.MAMinAF ?? row.maMinAF, 0)}, ${sqlInt(row.MAMaxAF ?? row.maMaxAF, 0)}, ${sqlNum(row.Eff1Code ?? row.EffCode1)}, ${sqlNum(row.Eff1Unit ?? row.EffUnit1)}, ${sqlNum(row.Eff2Code ?? row.EffCode2)}, ${sqlNum(row.Eff2Unit ?? row.EffUnit2)}, ${sqlNum(row.Eff3Code ?? row.EffCode3)}, ${sqlNum(row.Eff3Unit ?? row.EffUnit3)}, ${sqlNum(row.Eff4Code ?? row.EffCode4)}, ${sqlNum(row.Eff4Unit ?? row.EffUnit4)})`
}

const schemaSql = [
  '-- Weapon catalog schema',
  '',
  'CREATE TABLE game_weapon (',
  '    id             BIGSERIAL PRIMARY KEY,',
  '    game_code      VARCHAR(50)  NOT NULL UNIQUE,',
  '    name           VARCHAR(200) NOT NULL,',
  '    weapon_type    VARCHAR(30)  NOT NULL,',
  '    icon_id        INT          NOT NULL DEFAULT 0,',
  '    sprite_sheet   VARCHAR(500) NOT NULL,',
  '    sprite_cols    INT          NOT NULL DEFAULT 64,',
  '    grade          INT          NOT NULL DEFAULT 0,',
  '    civil_mask     VARCHAR(20)  NOT NULL DEFAULT \'11111\',',
  '    level_required INT          NOT NULL DEFAULT 0,',
  '    ga_min_af      INT          NOT NULL DEFAULT 0,',
  '    ga_max_af      INT          NOT NULL DEFAULT 0,',
  '    ma_min_af      INT          NOT NULL DEFAULT 0,',
  '    ma_max_af      INT          NOT NULL DEFAULT 0,',
  '    eff_code_1     INT,',
  '    eff_unit_1     NUMERIC(10, 6),',
  '    eff_code_2     INT,',
  '    eff_unit_2     NUMERIC(10, 6),',
  '    eff_code_3     INT,',
  '    eff_unit_3     NUMERIC(10, 6),',
  '    eff_code_4     INT,',
  '    eff_unit_4     NUMERIC(10, 6),',
  `    CONSTRAINT chk_game_weapon_type CHECK (weapon_type IN (${WEAPON_TYPE_CHECK}))`,
  ');',
  '',
  'CREATE INDEX idx_game_weapon_type ON game_weapon (weapon_type);',
  'CREATE INDEX idx_game_weapon_level ON game_weapon (level_required);',
  '',
].join('\n')

writeFileSync(join(migrationDir, 'V19__weapon_catalog_schema.sql'), schemaSql)

const dataPath = join(migrationDir, 'V20__weapon_catalog_data.sql')
writeFileSync(dataPath, '-- Weapon catalog data (LevelLim >= 35)\n\n')

const WEAPON_COLUMNS =
  'game_code, name, weapon_type, icon_id, sprite_sheet, sprite_cols, grade, civil_mask, level_required, ga_min_af, ga_max_af, ma_min_af, ma_max_af, eff_code_1, eff_unit_1, eff_code_2, eff_unit_2, eff_code_3, eff_unit_3, eff_code_4, eff_unit_4'

const seenCodes = new Set()
let total = 0
let batch = []

function flushBatch() {
  if (batch.length === 0) return
  const header = `INSERT INTO game_weapon (${WEAPON_COLUMNS}) VALUES\n`
  appendFileSync(dataPath, header + batch.join(',\n') + ';\n\n')
  batch = []
}

for (const file of WEAPON_FILES) {
  const path = join(xlsxDir, file)
  const rows = readSheetRows(path)
  let fileCount = 0
  let skippedDup = 0
  let skippedLevel = 0
  let skippedType = 0

  for (const row of rows) {
    const isExist = row.IsExist ?? row.isExist
    if (isExist !== 1 && isExist !== '1') continue

    const gameCode = row.Code ?? row.code
    const name = row.Name ?? row.name
    if (!gameCode || !name) continue

    const weaponType = weaponTypeFromRow(row)
    if (!weaponType) {
      skippedType++
      continue
    }

    const levelLim = parseInt(row.LevelLim ?? row.LvLim ?? 0, 10) || 0
    if (levelLim < MIN_LEVEL) {
      skippedLevel++
      continue
    }

    if (seenCodes.has(gameCode)) {
      skippedDup++
      continue
    }
    seenCodes.add(gameCode)

    batch.push(rowToInsert(row))
    fileCount++
    total++

    if (batch.length >= BATCH_SIZE) flushBatch()
  }

  console.log(
    `${file}: ${fileCount} (skipped level ${skippedLevel}, dup ${skippedDup}, type ${skippedType})`
  )
}

flushBatch()
console.log(`Total weapon rows: ${total}`)
console.log('Written V19 and V20 migrations')
