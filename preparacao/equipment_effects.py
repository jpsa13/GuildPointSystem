"""Separa bônus padrão por comparação com modelos normais/intense equivalentes."""
from collections import defaultdict
from decimal import Decimal
import re

ARMOR = {'HELMET', 'UPPER', 'LOWER', 'GLOVES', 'SHOES'}


def effects(row, accessory=False):
    count = row['EffNum']
    if not 0 <= count <= 4:
        raise ValueError(f"Quantidade de efeitos inválida: {row['Code']}")
    result = defaultdict(Decimal)
    for index in range(1, count + 1):
        code = row[f'EffCode{index}' if accessory else f'Eff{index}Code']
        if code:
            value = row[f'EffUnit{index}' if accessory else f'Eff{index}Unit']
            result[code] += Decimal(str(value)).quantize(Decimal('0.000001'))
    return tuple(sorted((code, value) for code, value in result.items()))


def key(category, row, level):
    common = (row.get('Civil'), row.get('ExpertID1'), row.get('ExpertID2'), level)
    if category == 'WEAPON':
        return common + (row.get('Type'), row.get('SubType'), row.get('ClassLim'), row.get('Model'))
    return common


def reference_level(row):
    match = re.fullmatch(r'i[hulgsw][a-z]{3}(\d{2})', row['Code'])
    nominal = int(match[1]) if match else row['LevelLim']
    return max(nominal, row['LevelLim'])


def build_baselines(category, records):
    if category not in ARMOR | {'WEAPON'}:
        return {}
    candidates = defaultdict(list)
    for row in records:
        grade = row['Grade' if category == 'WEAPON' else 'ItemGrade']
        if row.get('IsExist') == 1 and grade in (0, 1):
            candidates[key(category, row, reference_level(row))].append((grade, effects(row)))
    # Nunca eleger uma base conflitante. Algumas famílias Superior têm somente Grade 1.
    result = {}
    for k, rows in candidates.items():
        if len({fx for _, fx in rows}) == 1:
            result[k] = dict(rows[0][1])
        elif category == 'WEAPON':
            result[k] = dict(set.intersection(*(set(fx) for _, fx in rows)))
    return result


def extra_effects(category, row, baselines):
    raw = dict(effects(row, category in {'RING', 'AMULET'}))
    if category not in ARMOR | {'WEAPON'}:
        return raw, 'Efeitos próprios do acessório.'
    # Type C pode reduzir o nível exigido e conservar a família nominal do código.
    base = baselines.get(key(category, row, reference_level(row)))
    if base is None:
        return raw, 'Padrão não confirmado para este modelo; efeitos originais mantidos para conferência.'
    if any(code in base and value >= 0 and base[code] > value for code, value in raw.items()):
        return raw, 'Efeito diverge da base; valores originais mantidos para conferência.'
    extra = {code: value - base.get(code, Decimal(0)) for code, value in raw.items()
             if value != base.get(code, None)}
    return extra, 'Somente bônus extras; padrão removido por comparação com modelos-base equivalentes (Grade 0/1).'
