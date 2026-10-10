// Loads RF echelon Effect { Id, Name, Unit } from luaScript/Effects (recursive .lua files)
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const DEFAULT_EFFECTS_ROOT =
  process.env.RF_LUA_EFFECTS_DIR ??
  'C:\\Users\\Wesley-PC\\Desktop\\rf-echelon-src\\ServerOutput\\luaScript\\Effects'

/** @returns {Map<number, { id: number, name: string, unit: string }>} */
export function loadLuaEffectCatalog(root = DEFAULT_EFFECTS_ROOT) {
  const map = new Map()

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.name.toLowerCase().endsWith('.lua') || entry.name.startsWith('_')) continue
      const content = readFileSync(full, 'utf8')
      const id = parseInt(content.match(/\bId\s*=\s*(\d+)/)?.[1] ?? '', 10)
      const name = content.match(/\bName\s*=\s*"((?:\\.|[^"\\])*)"/)?.[1]?.replace(/\\"/g, '"')
      const unit = content.match(/\bUnit\s*=\s*"([^"]+)"/)?.[1]?.toLowerCase() ?? 'flat'
      if (!Number.isFinite(id) || !name) continue
      map.set(id, { id, name, unit })
    }
  }

  walk(root)
  return map
}

/** @param {{ name: string, unit: string }} def */
export function formatLuaItemEffect(def, rawValue) {
  if (!def) return null
  const v = Number(rawValue)
  if (!Number.isFinite(v)) return null

  switch (def.unit) {
    case 'percent':
      return `${trimNum(v)}% ${def.name}`
    case 'ms': {
      const sec = Math.abs(v) >= 100 ? Math.abs(v) / 1000 : Math.abs(v) / 1000
      return `${trimNum(sec)}s ${def.name}`
    }
    case 'flag':
      return v !== 0 ? def.name : null
    default:
      if (v === 0) return null
      return `${def.name} +${trimNum(v)}`
  }
}

function trimNum(n) {
  return Number(n)
    .toFixed(3)
    .replace(/\.?0+$/, '')
}
