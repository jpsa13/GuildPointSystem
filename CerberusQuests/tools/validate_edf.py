"""Validate Stage Era quest identity without writing to the client."""
import hashlib
import importlib.util
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLIENT = Path('F:/RF Cerberus - Stage Era')
OUT = ROOT / 'outputs/CerberusQuests-stage-validation'
spec = importlib.util.spec_from_file_location('edf', ROOT / 'outputs/cerberus-quest-monitor/edf/analyze_edf.py')
edf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edf)

def main():
    edf.self_test()
    paths = {'client': CLIENT/'RF_Online_4gb.bin', 'quest': CLIENT/'DataTable/Quest.edf',
             'english': CLIENT/'DataTable/en-gb/NDQuest.edf'}
    originals = {name:path.read_bytes() for name,path in paths.items()}
    hashes = {name:hashlib.sha256(data).hexdigest() for name,data in originals.items()}
    assert hashes['client'] == '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
    data = edf.decrypt(originals['quest'])
    sections = edf.sections(data)
    texts = edf.nd_strings(edf.decrypt(originals['english']), 'cp1252')
    matches = []
    for section_index, section in enumerate(sections):
        if section['width'] != 424: continue
        for row in range(section['count']):
            at = section['start'] + row*section['width']
            index,code = struct.unpack_from('<II',data,at)
            if code != 0x10082000: continue
            record = data[at:at+424]
            title, = struct.unpack_from('<I',record,0x140)
            assert index == row and title < len(texts)
            refs = {'title':[title], 'briefing':struct.unpack_from('<5i',record,0x144),
                    'summary':struct.unpack_from('<5i',record,0x158), 'action':struct.unpack_from('<2i',record,0x24)}
            assert all(i == -1 or 0 <= i < len(texts) for values in refs.values() for i in values)
            matches.append(dict(code='Q082000',binary_code='0x10082000',index=index,
                section=section_index,record_size=424,title_index=title,
                text={key:[texts[i]['text'] for i in values if i!=-1] for key,values in refs.items()},
                record_sha256=hashlib.sha256(record).hexdigest(),payload_offset=hex(at)))
            target_record = record
    assert len(matches)==1, f'Expected one target definition, found {len(matches)}'
    assert all(hashlib.sha256(path.read_bytes()).hexdigest()==hashes[name] for name,path in paths.items())
    OUT.mkdir(parents=True,exist_ok=True)
    result=dict(sources={key:dict(path=str(paths[key]),sha256=value) for key,value in hashes.items()},
                quest=matches[0],sections=sections,checks=['EDF roundtrip','section/string bounds','unique identity','sources unchanged'],
                completion_semantics_confirmed=False)
    (OUT/'q082000.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'q082000-record.bin').write_bytes(target_record)
    header = ['#pragma once', '#include <array>', 'namespace QuestProbe::Profile {',
              'inline constexpr wchar_t ClientPath[] = LR"(F:\\RF Cerberus - Stage Era\\RF_Online_4gb.bin)";',
              f'inline constexpr char ClientHash[] = "{hashes["client"]}";',
              f'inline constexpr char QuestHash[] = "{hashes["quest"]}";',
              f'inline constexpr char EnglishHash[] = "{hashes["english"]}";',
              'inline constexpr std::array<unsigned char,424> Record{']
    header += [','.join(f'0x{b:02x}' for b in target_record[i:i+16])+',' for i in range(0,424,16)]
    header += ['};', '}']
    path = ROOT/'CerberusQuests/src/quest_profile.hpp'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text('\n'.join(header)+'\n',encoding='utf-8')
    print(json.dumps(result['quest'],ensure_ascii=False,indent=2))

if __name__=='__main__': main()
