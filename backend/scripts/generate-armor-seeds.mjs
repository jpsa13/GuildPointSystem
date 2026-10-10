/**
 * Parses armor xlsx files and writes Flyway migrations (LevelLim >= 35 only).
 * Usage: node --max-old-space-size=8192 backend/scripts/generate-armor-seeds.mjs
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

const ARMOR_FILES = [
  { file: 'HelmetItem.xlsx', slot: 'HELMET', sprite: '/sprites/helmet.png', spriteCols: 32 },
  { file: 'UpperItem.xlsx', slot: 'UPPER', sprite: '/sprites/upper.png', spriteCols: 32 },
  { file: 'LowerItem.xlsx', slot: 'LOWER', sprite: '/sprites/lower.png', spriteCols: 32 },
  { file: 'GauntletItem.xlsx', slot: 'GAUNTLET', sprite: '/sprites/gloves.png', spriteCols: 32 },
  { file: 'ShoeItem.xlsx', slot: 'SHOES', sprite: '/sprites/shoes.png', spriteCols: 32 },
]

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

function rowToInsert(row, slot, sprite, spriteCols) {
  const gameCode = row.Code ?? row.code
  const name = row.Name ?? row.name
  const levelLim = parseInt(row.LevelLim ?? row.LvLim ?? 0, 10) || 0
  const iconId = sqlInt(row.IconID ?? row.iconID, 0)
  const grade = sqlInt(row.ItemGrade ?? row.itemGrade, 0)
  const civil = row.Civil ?? row.civil ?? '11111000'
  const defFc = sqlInt(row.DefFc ?? row.defFc, 0)
  const defFacing = row.DefFacing ?? row.defFacing
  const defFacingSql =
    defFacing == null || defFacing === '' ? 'NULL' : String(Number(defFacing))

  return `(${sqlValue(gameCode)}, ${sqlValue(name)}, '${slot}', ${iconId}, '${sprite}', ${spriteCols}, ${grade}, '${escapeSql(String(civil))}', ${levelLim}, ${defFc}, ${defFacingSql}, ${sqlNum(row.Eff1Code ?? row.EffCode1)}, ${sqlNum(row.Eff1Unit ?? row.EffUnit1)}, ${sqlNum(row.Eff2Code ?? row.EffCode2)}, ${sqlNum(row.Eff2Unit ?? row.EffUnit2)}, ${sqlNum(row.Eff3Code ?? row.EffCode3)}, ${sqlNum(row.Eff3Unit ?? row.EffUnit3)}, ${sqlNum(row.Eff4Code ?? row.EffCode4)}, ${sqlNum(row.Eff4Unit ?? row.EffUnit4)})`
}

const schemaSql = [
  '-- Armor catalog schema',
  '',
  'CREATE TABLE game_armor (',
  '    id             BIGSERIAL PRIMARY KEY,',
  '    game_code      VARCHAR(50)  NOT NULL UNIQUE,',
  '    name           VARCHAR(200) NOT NULL,',
  '    slot           VARCHAR(20)  NOT NULL,',
  '    icon_id        INT          NOT NULL DEFAULT 0,',
  '    sprite_sheet   VARCHAR(500) NOT NULL,',
  '    sprite_cols    INT          NOT NULL DEFAULT 128,',
  '    grade          INT          NOT NULL DEFAULT 0,',
  '    civil_mask     VARCHAR(20)  NOT NULL DEFAULT \'11111000\',',
  '    level_required INT          NOT NULL DEFAULT 0,',
  '    def_fc         INT          NOT NULL DEFAULT 0,',
  '    def_facing     NUMERIC(16, 12),',
  '    eff_code_1     INT,',
  '    eff_unit_1     NUMERIC(10, 6),',
  '    eff_code_2     INT,',
  '    eff_unit_2     NUMERIC(10, 6),',
  '    eff_code_3     INT,',
  '    eff_unit_3     NUMERIC(10, 6),',
  '    eff_code_4     INT,',
  '    eff_unit_4     NUMERIC(10, 6),',
  '    CONSTRAINT chk_game_armor_slot CHECK (slot IN (\'HELMET\', \'UPPER\', \'LOWER\', \'GAUNTLET\', \'SHOES\'))',
  ');',
  '',
  'CREATE INDEX idx_game_armor_slot ON game_armor (slot);',
  'CREATE INDEX idx_game_armor_level ON game_armor (level_required);',
  '',
].join('\n')

writeFileSync(join(migrationDir, 'V11__armor_catalog_schema.sql'), schemaSql)

const dataPath = join(migrationDir, 'V12__armor_catalog_data.sql')
writeFileSync(dataPath, '-- Armor catalog data (LevelLim >= 35)\n\n')

const ARMOR_COLUMNS =
  'game_code, name, slot, icon_id, sprite_sheet, sprite_cols, grade, civil_mask, level_required, def_fc, def_facing, eff_code_1, eff_unit_1, eff_code_2, eff_unit_2, eff_code_3, eff_unit_3, eff_code_4, eff_unit_4'

const seenCodes = new Set()
let total = 0
let batch = []

function flushBatch() {
  if (batch.length === 0) return
  const header = `INSERT INTO game_armor (${ARMOR_COLUMNS}) VALUES\n`
  appendFileSync(dataPath, header + batch.join(',\n') + ';\n\n')
  batch = []
}

for (const { file, slot, sprite, spriteCols } of ARMOR_FILES) {
  const path = join(xlsxDir, file)
  const rows = readSheetRows(path)
  let slotCount = 0
  let skippedDup = 0
  let skippedLevel = 0

  for (const row of rows) {
    const isExist = row.IsExist ?? row.isExist
    if (isExist !== 1 && isExist !== '1') continue

    const gameCode = row.Code ?? row.code
    const name = row.Name ?? row.name
    if (!gameCode || !name) continue

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

    batch.push(rowToInsert(row, slot, sprite, spriteCols))
    slotCount++
    total++

    if (batch.length >= BATCH_SIZE) flushBatch()
  }

  console.log(`${slot}: ${slotCount} (skipped level ${skippedLevel}, dup ${skippedDup})`)
}

flushBatch()
console.log(`Total armor rows: ${total}`)
console.log('Written V11 and V12 migrations')
