"""Join NDStore -> Store NPC codes -> Quest offer records -> quest definitions."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path
import struct
import re
from replay_site import CLIENT_HASH, EDF_HASH, TEXT_HASH, catalog
import importlib.util

TARGETS = tuple(f'Coupon Reward Manager {i}' for i in (2, 3, 4))
EXTRAS = {'Q070944', 'Q070947'}
CORA = 1


def item_rewards(record):
    if len(record) != 424:
        raise ValueError('Invalid quest definition size')
    return {(table, code) for table, code, count in
            (struct.unpack_from('<III', record, 0x88 + i * 12) for i in range(6))
            if table != 0xffffffff and code != 0xffffffff and count > 0}


def store_names(data):
    if len(data) < 4:
        raise ValueError('Truncated NDStore')
    count, = struct.unpack_from('<I', data)
    if count > 10000:
        raise ValueError('NDStore count exceeds bound')
    pos, result = 4, []
    for index in range(count):
        if pos + 72 > len(data):
            raise ValueError('Truncated NDStore row')
        row_index, = struct.unpack_from('<I', data, pos)
        size, = struct.unpack_from('<I', data, pos + 68)
        if row_index != index or pos + 72 + size > len(data):
            raise ValueError('Invalid NDStore bounds/index')
        result.append(data[pos + 4:pos + 36].split(b'\0')[0].decode('cp1252'))
        pos += 72 + size
    if pos != len(data):
        raise ValueError('Trailing NDStore data')
    return result


def extract(client):
    definitions = catalog(client)  # Pins client, Quest and English quest text hashes.
    spec = importlib.util.spec_from_file_location('coupon_edf', Path(__file__).resolve().parents[2] / 'outputs/cerberus-quest-monitor/edf/analyze_edf.py')
    edf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(edf)
    base = client / 'DataTable'
    raw = {name: (base / path).read_bytes() for name, path in [('store', 'Store.edf'), ('storeText', 'en-gb/NDStore.edf'), ('quest', 'Quest.edf'), ('questText', 'en-gb/NDQuest.edf')]}
    names = store_names(edf.decrypt(raw['storeText']))
    store = edf.decrypt(raw['store'])
    table, = edf.sections(store)
    if table['width'] != 1944 or table['count'] != len(names):
        raise ValueError('Unsupported Store layout')
    npcs = {}
    for index, name in enumerate(names):
        record = store[table['start'] + index * 1944:table['start'] + (index + 1) * 1944]
        row, code, race = struct.unpack_from('<III', record)
        if race != CORA:
            continue
        text_code = record[0x49:0x68].split(b'\0')[0].decode('ascii')
        if row != index or int(text_code, 16) != code or race not in (0, 1, 2):
            raise ValueError('Store NPC identity mismatch')
        npcs[code] = dict(name=name, code=f'{code:05X}', race=race)
    body = edf.decrypt(raw['quest'])
    texts = edf.nd_strings(edf.decrypt(raw['questText']), 'cp1252')
    by_code = {struct.unpack_from('<I', record, 4)[0]: (hash_, record, code, title or code) for hash_, (record, code, title) in definitions.items()}
    emblems = {reward for record, code, title in definitions.values()
               if re.search(r'\b(Easy|Medium|Hard)\+? Cartella Quest Reward', title)
               for reward in item_rewards(record) if reward[0] == 20}
    if emblems != {(20, 0xc5081622), (20, 0xc5081623), (20, 0xc5081624)}:
        raise ValueError('Unexpected Cartella emblem identities')
    # A 336-byte NPC offer row has three 108-byte alternatives. Each carries
    # a quest/reference pair; all alternatives must be joined, not only the first.
    joined = {}
    for section in edf.sections(body):
        if section['width'] != 336:
            continue
        for index in range(section['count']):
            row = body[section['start'] + index * 336:section['start'] + (index + 1) * 336]
            npc_code, = struct.unpack_from('<I', row, 4)
            if npc_code not in npcs:
                continue
            for offset in (0x50, 0xbc, 0x128):
                first, second = struct.unpack_from('<II', row, offset)
                if first == 0xffffffff and second == 0xffffffff:
                    continue
                if first != second or first not in by_code:
                    raise ValueError('Unresolved NPC quest offer pair')
                hash_, definition, code, title = by_code[first]
                npc = npcs[npc_code]
                if npc['name'] not in TARGETS and code not in EXTRAS and not item_rewards(definition) & emblems:
                    continue
                summaries = [texts[i]['text'].strip() for i in struct.unpack_from('<5i', definition, 0x158) if 0 <= i < len(texts) and texts[i]['text'].strip()]
                objectives = []
                for action_index in range(3):
                    action = struct.unpack_from('<8I', definition, 0x10 + action_index * 32)
                    if action[0] == 255:
                        continue
                    if action[0] == 1 and action[1] in npcs:
                        objectives.append('Conversar com ' + npcs[action[1]]['name'])
                    else:
                        description = summaries[0] if summaries else 'Objetivo sem texto utilizável no EDF'
                        objectives.append(description + (f' · Quantidade: {action[4]}' if 0 < action[4] < 1000000 else ''))
                joined[(hash_, npc_code)] = dict(quest=dict(code=code, title=title, definitionHash=hash_), npcName=npc['name'],
                    npcCode=npc['code'], race=npc['race'], objectives=list(dict.fromkeys(objectives or summaries)))
    grouped = {}
    for row in joined.values():
        key = (row['quest']['definitionHash'], row['npcName'])
        group = grouped.setdefault(key, dict(quest=row['quest'], npcName=row['npcName'], npcCodes=[], races=[], objectives=row['objectives']))
        group['npcCodes'].append(row['npcCode'])
        if row['race'] not in group['races']:
            group['races'].append(row['race'])
    quests = sorted(grouped.values(), key=lambda x: (x['npcName'], x['quest']['code']))
    included_names = list(TARGETS) + sorted({q['npcName'] for q in quests} - set(TARGETS))
    coverage = [dict(name=name, npcCodes=sorted(npc['code'] for npc in npcs.values() if npc['name'] == name),
                     questCount=len({q['quest']['definitionHash'] for q in quests if q['npcName'] == name})) for name in included_names]
    if not EXTRAS <= {q['quest']['code'] for q in quests} or not any('Medium+' in q['quest']['title'] for q in quests):
        raise ValueError('Missing requested Cora quests')
    return dict(quests=quests, npcs=coverage, sourceHashes={name: hashlib.sha256(data).hexdigest() for name, data in raw.items()})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--client', type=Path, default=Path('F:/RF Cerberus - Stage Era'))
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    result = extract(args.client)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_bytes(gzip.compress(json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    all_rows = [dict(code=code, title=title or code, definitionHash=hash_) for hash_, (_, code, title) in catalog(args.client).items()]
    args.out.with_name('catalog.json.gz').write_bytes(gzip.compress(json.dumps(all_rows, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    print(json.dumps(dict(npcs=result['npcs'], rows=len(result['quests']), sourceHashes=result['sourceHashes']), indent=2))


if __name__ == '__main__':
    main()
