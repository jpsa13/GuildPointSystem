"""Read-only, bounded analysis of the three Cerberus quest EDFs. No game code runs."""
from pathlib import Path
import hashlib
import json
import struct

OUT = Path(__file__).resolve().parent
CLIENT = Path('F:/RF Cerberus/DataTable')
EXPECTED_QUEST = 'fd85f658870c48a5444b6345ff63d5a7cbc8263989a59ffffcd76626e2f34d86'

def unpack(fmt, data, offset):
    if offset < 0 or offset + struct.calcsize(fmt) > len(data):
        raise ValueError(f'Truncated data at {offset:#x}: {fmt}')
    return struct.unpack_from(fmt, data, offset)

def decrypt(data):
    if data[:29] != b'RF Online by OdinTeam s(^O^)z':
        raise ValueError('Unrecognized EDF header')
    size, = unpack('<I', data, 29)
    if size != len(data) - 33 - 256:
        raise ValueError('Invalid EDF payload size')
    stored_key = data[33 + size:]
    key = bytearray((v + (-1 if i % 2 == 0 else 1) * (1 << ((i + 1) % 8))) & 255
                    for i, v in enumerate(stored_key))
    key.reverse()
    for i in range(0, 256, 2):
        key[i], key[i + 1] = key[i + 1], key[i]
    body = bytes((v + (-1 if i % 2 == 0 else 1) * key[(i + 1) % 256]) & 255
                 for i, v in enumerate(data[33:33 + size]))
    # Reconstruct every original byte to detect a transformation implementation error.
    inverse = bytearray(key)
    for i in range(0, 256, 2):
        inverse[i], inverse[i + 1] = inverse[i + 1], inverse[i]
    inverse.reverse()
    inverse = bytes((v + (1 if i % 2 == 0 else -1) * (1 << ((i + 1) % 8))) & 255
                    for i, v in enumerate(inverse))
    encoded = bytes((v + (1 if i % 2 == 0 else -1) * key[(i + 1) % 256]) & 255
                    for i, v in enumerate(body))
    assert data == data[:33] + encoded + inverse
    return body

def sections(data):
    result, offset = [], 0
    while offset < len(data):
        count, width = unpack('<II', data, offset)
        end = offset + 8 + count * width
        if width == 0 or end > len(data):
            raise ValueError(f'Invalid section at {offset:#x}')
        result.append(dict(header_offset=offset, start=offset + 8, count=count, width=width, end=end))
        offset = end
    return result

def nd_strings(data, encoding):
    count, width = unpack('<II', data, 0)
    if width != 32 or count > len(data) // 32:
        raise ValueError('Invalid ND item-name section')
    header = 8 + count * width
    count, width = unpack('<II', data, header)
    if width != 16 or count > len(data) // 16:
        raise ValueError('Invalid ND string descriptors')
    pos = header + 8 + count * width
    result = []
    for i in range(count):
        idx, unknown, length, trailing = unpack('<4I', data, header + 8 + i * 16)
        if idx != i or pos + length > len(data):
            raise ValueError('Invalid ND index or string length')
        raw = data[pos:pos + length]
        result.append(dict(index=idx, descriptor_offset=header + 8 + i * 16,
                           text_offset=pos, byte_length=length, unknown=unknown,
                           trailing=trailing, text=raw.rstrip(b'\0').decode(encoding)))
        pos += length
    if pos != len(data):
        raise ValueError('Unexpected ND trailing data')
    return result

def self_test():
    for invalid in (b'', b'RF Online by OdinTeam s(^O^)z' + b'\0' * 4):
        try:
            decrypt(invalid)
        except ValueError:
            pass
        else:
            raise AssertionError('Malformed EDF accepted')
    for operation in (lambda: sections(struct.pack('<II', 99, 424)),
                      lambda: nd_strings(struct.pack('<II', 0, 32) + struct.pack('<II', 3, 16), 'cp1252')):
        try:
            operation()
        except ValueError:
            pass
        else:
            raise AssertionError('Truncated section accepted')

def main():
    self_test()
    sources, bodies = {}, {}
    for key, rel in [('quest', 'Quest.edf'), ('en-gb', 'en-gb/NDQuest.edf'), ('ru-ru', 'ru-ru/NDQuest.edf')]:
        path = CLIENT / rel
        original = path.read_bytes()
        sources[key] = dict(path=str(path), size=len(original), sha256=hashlib.sha256(original).hexdigest())
        bodies[key] = decrypt(original)
    assert sources['quest']['sha256'] == EXPECTED_QUEST
    layout = sections(bodies['quest'])
    assert len(layout) == 12 and layout[7]['width'] == 424 and layout[7]['count'] == 4979
    table = layout[7]
    matches = []
    for row in range(table['count']):
        offset = table['start'] + row * table['width']
        index, code = unpack('<II', bodies['quest'], offset)
        if code == int('10' + '082000', 16):
            matches.append((row, offset, index, code))
    assert len(matches) == 1
    row, offset, index, code = matches[0]
    assert row == index == 150 and offset == 0xCDC60
    record = bodies['quest'][offset:offset + 424]
    assert unpack('<I', record, 0x140) == (36,)
    texts = {lang: nd_strings(bodies[lang], encoding) for lang, encoding in [('en-gb', 'cp1252'), ('ru-ru', 'cp1251')]}
    refs = {'title': [unpack('<i', record, 0x140)[0]],
            'briefing': list(unpack('<5i', record, 0x144)),
            'summary': list(unpack('<5i', record, 0x158)),
            'action_texts': list(unpack('<2i', record, 0x24))}
    for strings in texts.values():
        if any(i != -1 and not 0 <= i < len(strings) for indices in refs.values() for i in indices):
            raise ValueError('Invalid quest text reference')
    localized = {lang: {name: [strings[i] for i in indices if i != -1] for name, indices in refs.items()}
                 for lang, strings in texts.items()}
    rewards = []
    for i in range(6):
        at = 0x88 + i * 12
        table_code, code_value, count = unpack('<III', record, at)
        rewards.append(dict(slot=i, record_offset=at, table_code=table_code,
                            code=f'0x{code_value:08X}', quantity_field=count))
    actions = []
    for i in range(3):
        at = 0x10 + i * 32
        values = unpack('<8I', record, at)
        actions.append(dict(slot=i, record_offset=at, type=values[0] & 255,
                            subject=values[1], subject2=values[2], area=values[3], required=values[4],
                            condition_text_index=values[5], result_text_index=values[6], quest_item=values[7]))
    hits = []
    needle = struct.pack('<I', code)
    start = 0
    while (start := bodies['quest'].find(needle, start)) >= 0:
        sec_idx = next(i for i, section in enumerate(layout) if section['start'] <= start < section['end'])
        sec = layout[sec_idx]
        hits.append(dict(payload_offset=start, section=sec_idx,
                         row=(start-sec['start'])//sec['width'], within_record=(start-sec['start'])%sec['width']))
        start += 1
    for source in sources.values():
        assert hashlib.sha256(Path(source['path']).read_bytes()).hexdigest() == source['sha256']
    result = dict(sources=sources, sections=layout, quest=dict(code='Q082000', binary_code=f'0x{code:08X}',
                  index=index, row=row, payload_record_offset=offset, edf_record_offset=offset+33,
                  record_size=424, type=record[8], difficulty=record[9], race_field=record[10],
                  level_byte=record[11], actions=actions, rewards=rewards,
                  reward_exp=unpack('<d',record,112)[0], reward_currencies=unpack('<4I',record,120),
                  nd_references=refs, localized=localized), code_occurrences=hits,
                  checks=['full EDF decode/re-encode exact roundtrip on all three inputs',
                          'malformed/truncated EDF, section and ND rejected',
                          'all sections reach exact EOF; every ND descriptor index and string bound checked',
                          'unique target code in main quest table, row/index150 and title offset+0x140 asserted',
                          'input SHA256 unchanged after analysis'],
                  limits=['No runtime execution or server-data verification',
                          'Reward list alone does not establish all vs selectable rewards',
                          'Action15 labeled only by actual Cerberus text, not external enum guesses'])
    (OUT/'q082000.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT/'q082000-record.hex.txt').write_text('\n'.join(f'{i:04X}  {record[i:i+16].hex(" ")}' for i in range(0,len(record),16))+'\n',encoding='ascii')
    print('PASS: Q082000 = 0x10082000; index150; title36; 3 EDF roundtrips; malformed input tests; unchanged sources.')

if __name__ == '__main__':
    main()
