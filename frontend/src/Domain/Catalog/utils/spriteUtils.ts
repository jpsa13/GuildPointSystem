import type { CSSProperties } from 'react'

/** Ring/amulet sheet: 32 icons per row. */
export const RING_SPRITE_COLS = 32

/** Weapon / armor sheets: 32×32 grid on 2048² sheets. */
export const WEAPON_SPRITE_COLS = 32
export const ARMOR_SPRITE_COLS = 32

/** resource.png: 16 columns (64px cells on 1024×2048). */
export const RESOURCE_SPRITE_COLS = 16

/** shield.png: 8 columns (64px cells on 512×1024). */
export const SHIELD_SPRITE_COLS = 8

/** potion.png: 32×32 on 2048². */
export const POTION_SPRITE_COLS = 32

const RING_SHEET = '/sprites/ringseamulets.png'

/** Pixel size and column count per local sprite sheet (IconIDX = linear grid index). */
const SHEET_LAYOUTS: Record<string, { width: number; height: number; cols: number }> = {
  '/sprites/weapon.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/helmet.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/upper.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/lower.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/gloves.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/shoes.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/potion.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/booty.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/ringseamulets.png': { width: 2048, height: 2048, cols: 32 },
  '/sprites/shield.png': { width: 512, height: 1024, cols: 8 },
  '/sprites/resource.png': { width: 1024, height: 2048, cols: 16 },
}

const ARMOR_SHEETS = new Set([
  '/sprites/helmet.png',
  '/sprites/upper.png',
  '/sprites/lower.png',
  '/sprites/gloves.png',
  '/sprites/shoes.png',
])

export function spriteColsForSheet(spriteSheet: string): number {
  const layout = SHEET_LAYOUTS[spriteSheet]
  if (layout) return layout.cols
  if (spriteSheet === RING_SHEET) return RING_SPRITE_COLS
  return ARMOR_SHEETS.has(spriteSheet) ? ARMOR_SPRITE_COLS : RING_SPRITE_COLS
}

/**
 * RF Online item icons: IconIDX is a linear index into a fixed-column sprite sheet.
 */
export function spriteBackgroundStyle(
  spriteSheet: string,
  iconId: number,
  size = 64,
  spriteCols?: number
): CSSProperties {
  const layout = SHEET_LAYOUTS[spriteSheet]
  const cols = layout?.cols ?? spriteCols ?? spriteColsForSheet(spriteSheet)

  const col = iconId % cols
  const row = Math.floor(iconId / cols)

  if (layout) {
    const cellPx = layout.width / layout.cols
    const scale = size / cellPx

    return {
      width: size,
      height: size,
      display: 'block',
      backgroundImage: `url(${spriteSheet})`,
      backgroundPosition: `${-col * size}px ${-row * size}px`,
      backgroundSize: `${layout.width * scale}px ${layout.height * scale}px`,
      backgroundRepeat: 'no-repeat',
      flexShrink: 0,
    }
  }

  const sheetSize = cols * size

  return {
    width: size,
    height: size,
    display: 'block',
    backgroundImage: `url(${spriteSheet})`,
    backgroundPosition: `${-col * size}px ${-row * size}px`,
    backgroundSize: `${sheetSize}px ${sheetSize}px`,
    backgroundRepeat: 'no-repeat',
    flexShrink: 0,
  }
}
