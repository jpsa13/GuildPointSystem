"""Check bounded code evidence; never reads or writes the live process."""
import hashlib
import json
from pathlib import Path
import struct
import sys


def analyze(folder):
    code = (folder/'code-00560000.bin').read_bytes()
    vtable = (folder/'vtable-00A50300.bin').read_bytes()
    assert len(code) == 0x3000 and len(vtable) == 0x100
    assert struct.unpack_from('<I', vtable, 0x34)[0] == 0x560f80
    assert code[0xf80:0xf89] == bytes.fromhex('55 8b ec 83 ec 08 89 4d fc')
    assert code[0xf89:0xf93] == bytes.fromhex('8b 45 08 0f b6 48 02 83 f9 18')
    assert code[0xf9c:0xfa3] == bytes.fromhex('8b 55 08 0f b6 42 03')
    assert code[0xfbc:0xfca] == bytes.fromhex('0f b6 82 e8 10 56 00 ff 24 85 b0 10 56 00')
    assert code[0x10a7:0x10af] == bytes.fromhex('b0 01 8b e5 5d c2 08 00')
    cases = {}
    for subtype in (1, 5, 6, 7, 0x32, 0x6f):
        branch = struct.unpack_from('<I', code, 0x10b0+4*code[0x10e8+subtype-1])[0]
        at = branch-0x560000
        # Every selected arm loads payload argument, pushes it and restores this.
        assert code[at+2] == 0x0c and code[at+4:at+7] == bytes.fromhex('8b 4d fc')
        assert code[at+7] == 0xe8
        callee = branch+12+struct.unpack_from('<i', code, at+8)[0]
        cases[hex(subtype)] = dict(branch=hex(branch), callee=hex(callee))
    assert cases['0x5']['callee'] == '0x5614b0'
    assert code[0x14e4:0x14e9] == bytes.fromhex('8b 4d ec 8a 11')  # payload byte zero
    assert code[0x15b1:0x15b4] == bytes.fromhex('c2 04 00')
    state_evidence = folder/'code-00488E00.bin'
    remap_verified = False
    if state_evidence.exists():
        state = state_evidence.read_bytes()
        assert len(state) == 0x2000
        assert code[0x1530:0x1537] == bytes.fromhex('0f b6 02 83 c0 67 50')
        assert code[0x154b:0x1550] == bytes.fromhex('e8 a0 79 f2 ff')
        assert state[0x137:0x13c] == bytes.fromhex('e8 b4 19 00 00')
        assert state[0x1afa:0x1b00] == bytes.fromhex('8a 4d 08 88 48 18')
        assert state[0x1b03:0x1b06] == bytes.fromhex('c2 04 00')
        remap_verified = True
    return dict(evidence=str(folder), sha256=hashlib.sha256(code).hexdigest(),
                dispatch='0x00560f80', group='0x18', cases=cases,
                abi='x86 thiscall: ECX this, two stack arguments, AL boolean, ret 8',
                payload_first_byte_used=True, slot_plus_103_code_path_verified=remap_verified, live_event_seen=False,
                reward_completion_semantics_confirmed=False)


if __name__ == '__main__':
    folder = Path(sys.argv[1])
    result = analyze(folder)
    output = Path(__file__).resolve().parents[2]/'outputs/CerberusQuests-stage-validation/handler.json'
    output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
