import { formatEffectValue } from '@/Domain/Catalog/utils/catalogUtils'
import type { EquipmentEffect } from '../types'

export function formatEquipmentEffect(effect: EquipmentEffect): string {
  // Sincronizado pelo jogo em modelo com mais de uma variação: a administração confirma.
  if (effect.key === 'client:unverified') return 'Efeito a confirmar pela administração'
  if (effect.code === null) return 'Sem efeito extra'
  // Exemplares antigos conservam o formato registrado antes da importação do dicionário.
  if (effect.unitHint == null) return `${effect.name} · ${formatEffectValue(effect.displayType, effect.value, effect.code)}`
  const hint = effect.unitHint.toLowerCase().replace(/[^a-z0-9]/g, '')
  let value = effect.value
  let suffix = ''
  if (hint === 'percent01' || (hint === 'percent0100' && Math.abs(value) < 1 && !Number.isInteger(value)) || (!hint && !Number.isInteger(value))) {
    value *= 100
    suffix = '%'
  } else if (hint === 'percent0100') suffix = '%'
  else if (hint === 'ms') suffix = ' ms'
  return `${effect.name || effect.description || `Efeito ${effect.code}`} · ${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`
}
