"""Prepare the bounded Cora Spiritualist Flym quest profile from the verified EDF."""
import hashlib
import json
import struct
from validate_edf import ROOT, CLIENT, edf

expected = json.loads((ROOT/'outputs/CerberusQuests-stage-validation/q082000.json').read_text(encoding='utf-8'))['sources']
raw = (CLIENT/'DataTable/Quest.edf').read_bytes()
assert hashlib.sha256(raw).hexdigest() == expected['quest']['sha256']
nd = (CLIENT/'DataTable/en-gb/NDQuest.edf').read_bytes()
assert hashlib.sha256(nd).hexdigest() == expected['english']['sha256']
data = edf.decrypt(raw)
texts = edf.nd_strings(edf.decrypt(nd), 'cp1252')
records = []
for section in edf.sections(data):
    if section['width'] != 424:
        continue
    for row in range(section['count']):
        at = section['start'] + row*424
        record = data[at:at+424]
        if struct.unpack_from('<I',record,4)[0] == 0x10082010:
            records.append(record)
assert len(records) == 1
record = records[0]
assert record[10] == 1 and struct.unpack_from('<I',record,0x20)[0] == 5
refs = struct.unpack_from('<11i',record,0x140)
assert all(n == -1 or 0 <= n < len(texts) for n in refs)
text = [texts[n]['text'] for n in refs if n >= 0]
assert 'Flym' in ' '.join(text)
header = ['#pragma once', '#include <array>', 'namespace QuestProbe::Flym {',
          'inline constexpr unsigned Code = 0x10082010;',
          'inline constexpr std::array<unsigned char,424> Record{']
header += [','.join(f'0x{b:02x}' for b in record[i:i+16])+',' for i in range(0,424,16)]
header += ['};','}']
(ROOT/'CerberusQuests/src/flym_profile.hpp').write_text('\n'.join(header)+'\n',encoding='utf-8')
result = dict(code='Q082010', race=record[10], required_first_objective=5,
              record_sha256=hashlib.sha256(record).hexdigest(), text=text)
(ROOT/'outputs/CerberusQuests-stage-validation/flym.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print('PASS: unique Q082010 definition, race 1, required count 5, Flym text, verified EDF hashes')
