"""Verify the portable download without loading a DLL or running the game."""
import hashlib
import json
from pathlib import Path
import struct
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
ZIP = ROOT / 'downloads/RF-ui-Stage-Era-portatil.zip'


class PortableZipTests(unittest.TestCase):
    def test_exact_payload_hashes_architecture_and_notices(self):
        with zipfile.ZipFile(ZIP) as archive:
            names = archive.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertFalse(any('..' in Path(name).parts or name.startswith('/') for name in names))
            self.assertFalse(any('backups' in Path(name).parts or name.endswith(('.exe', '.bin', '.log')) for name in names))
            prefix = 'rf-ui-portatil/'
            self.assertEqual(sorted(name for name in names if name.endswith('.dll')),
                             [prefix + 'payload/dinput8.dll', prefix + 'payload/version.dll'])
            manifest = json.loads(archive.read(prefix + 'manifest.json'))
            self.assertEqual({entry['file'] for entry in manifest}, {'dinput8.dll', 'version.dll', 'rf-ui.ini', 'CerberusBags.ini'})
            for entry in manifest:
                data = archive.read(prefix + 'payload/' + entry['file'])
                self.assertEqual(hashlib.sha256(data).hexdigest(), entry['sha256'])
                if entry['file'].endswith('.dll'):
                    offset, = struct.unpack_from('<I', data, 0x3c)
                    self.assertEqual(data[offset:offset + 4], b'PE\0\0')
                    self.assertEqual(struct.unpack_from('<H', data, offset + 4)[0], 0x14c)
            license_text = archive.read(prefix + 'licencas/rf-ui-LICENSE.txt').decode('utf-8-sig')
            self.assertIn('Required Notice: Copyright (c) 2026 r3ngr4y', license_text)
            self.assertIn('PolyForm Noncommercial', license_text)
            config = archive.read(prefix + 'payload/rf-ui.ini').decode('ascii')
            self.assertNotIn('hotbar.cells', config)
            self.assertIn(prefix + 'Instalar.ps1', names)
            self.assertIn(prefix + 'LEIA-ME.md', names)
            self.assertIn(prefix + 'licencas/CerberusBags-COPYING.MinGW-w64-runtime.txt', names)


if __name__ == '__main__':
    unittest.main()
