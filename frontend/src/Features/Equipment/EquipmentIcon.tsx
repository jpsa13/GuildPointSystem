import sheets from '@/Domain/Equipment/icon-sheets.json'
import type { EquipmentItem } from '@/Domain/Equipment/types'

export function EquipmentIcon({ item, size = 48 }: { item: Pick<EquipmentItem, 'category' | 'iconId' | 'sourceHash'>; size?: number }) {
  const sheet = sheets.sheets[item.category as keyof typeof sheets.sheets]
  const index = item.iconId
  if (item.sourceHash !== sheets.sourceHash || !sheet || index == null || !Number.isInteger(index) || index < 0 || index >= sheet.cols * sheet.rows) {
    return <span className="equipment-icon equipment-icon--missing" aria-hidden="true" title="Sem prévia visual para esta fonte" style={{ width: size, height: size }}>?</span>
  }
  // shortcut: vínculo por categoria do catálogo local; confirmar pixels no jogo antes de remover o aviso.
  return <span className="equipment-icon" aria-hidden="true" title="Prévia do DDS · associação ainda não confirmada no jogo" style={{
    width: size, height: size, backgroundImage: `url(${sheet.path})`,
    backgroundSize: `${sheet.width * size / 64}px ${sheet.height * size / 64}px`,
    backgroundPosition: `${-(index % sheet.cols) * size}px ${-Math.floor(index / sheet.cols) * size}px`,
  }} />
}

const EMPTY_SLOT_PATHS: Record<string, string> = {
  WEAPON: 'M8 24 23 9 25 4 20 6 6 21 M4 19 12 27 M4 28 8 24',
  HELMET: 'M10 4h12l5 6v13l-6 5H11l-6-5V10z M8 12l8 4 8-4 M8 12v8l5 3 M24 12v8l-5 3 M16 16v9 M12 7h8',
  UPPER: 'M11 5l5 3 5-3 7 5-3 7-4-3v13H11V14l-4 3-3-7z M4 10l7 1 M28 10l-7 1 M11 14l5 4 5-4 M11 22h10 M16 18v9',
  LOWER: 'M9 5h14v7l3 15h-8l-2-10-2 10H6l3-15z M9 10h14 M10 14l4 2 M22 14l-4 2 M8 22h6 M18 22h6',
  GLOVES: 'M5 7h8v6l2 3-2 7-4 3-5-5 1-6z M27 7h-8v6l-2 3 2 7 4 3 5-5-1-6z M5 11h8 M19 11h8 M6 16l5 2 M26 16l-5 2',
  SHOES: 'M7 5h7v13l-2 3v6H3v-5l4-5z M25 5h-7v13l2 3v6h9v-5l-4-5z M7 10h7 M18 10h7 M3 23h9 M20 23h9',
  CLOAK: 'M12 5h8l7 23-11-4-11 4z M12 5l4 7 4-7 M16 12v12',
  RING: 'M9 11 12 5h8l3 6-7 6z M10 14a9 9 0 1 0 12 0',
  AMULET: 'M6 5c0 10 4 14 10 14S26 15 26 5 M16 17l5 6-5 6-5-6z',
}
export function EmptyEquipmentSlot({ category }: { category: string }) {
  return <svg className="equipment-slot-empty" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={EMPTY_SLOT_PATHS[category]} /></svg>
}
