import math
from pathlib import Path
import struct
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from live_reader import player, AVATAR_POINTER
from monitor_site import Tracker
from extract_coupon_catalog import store_names, item_rewards


class FakeReader:
    created = 123
    def __init__(self, name=b'meow', level=55, rate=0.0):
        self.head = bytearray(64)
        struct.pack_into('<I', self.head, 0, 0xa41e4c)
        struct.pack_into('<I', self.head, 8, 51)
        self.head[16:16 + len(name)] = name
        self.level, self.rate = level, rate
    def uint(self, address):
        if address == AVATAR_POINTER:
            return 0x100000
        if address == 0x104024:
            return self.level
        raise ValueError('Unexpected field read')
    def read(self, address, size):
        if address == 0x100000 and size == 64:
            return bytes(self.head)
        if address == 0x10580c and size == 4:
            return struct.pack('<f', self.rate)
        raise ValueError('Unexpected memory read')


class LiveMonitorTests(unittest.TestCase):
    def test_confirmed_player_and_invalid_values(self):
        sample = player(FakeReader())
        self.assertEqual((sample['name'], sample['level'], sample['xpPercent']), ('meow', 55, 0))
        self.assertNotIn('avatar', sample)
        for reader in (FakeReader(level=0), FakeReader(rate=float('nan')), FakeReader(rate=1.1), FakeReader(name=b'')):
            with self.assertRaises(ValueError):
                player(reader)
        self.assertNotEqual(sample['identityEpoch'], player(FakeReader(name=b'another'))['identityEpoch'])

    def test_completion_is_not_repeated_and_new_execution_has_new_id(self):
        tracker = Tracker()
        row = dict(code='Q071356', title='Ore', definitionHash='a' * 64, group=1, type=1, slot=8)
        first = tracker.update({123: row}, '2026-10-23T23:00:00Z')
        self.assertEqual(len(first), 1)
        self.assertEqual(tracker.update({123: row}, '2026-10-23T23:00:01Z'), [])
        done = tracker.update({123: dict(row, slot=111)}, '2026-10-23T23:00:02Z')
        self.assertEqual(done[0]['state'], 'COMPLETION_SIGNAL')
        self.assertEqual(done[0]['runId'], first[0]['runId'])
        self.assertEqual(tracker.update({123: dict(row, slot=111)}, '2026-10-23T23:00:03Z'), [])
        removed = tracker.update({}, '2026-10-23T23:00:04Z')
        self.assertEqual(removed[0]['state'], 'REMOVED_UNKNOWN')
        second = tracker.update({123: row}, '2026-10-23T23:00:05Z')
        self.assertNotEqual(first[0]['runId'], second[0]['runId'])

    def test_untested_quest_does_not_gain_confirmed_completion(self):
        tracker = Tracker()
        row = dict(code='Q071439', title='Coupon', definitionHash='a' * 64, group=1, type=1, slot=8)
        tracker.update({123: row}, '2026-10-23T23:00:00Z')
        events = tracker.update({123: dict(row, slot=111)}, '2026-10-23T23:00:01Z')
        self.assertEqual([e['state'] for e in events], ['STATE_CHANGED'])
        self.assertEqual(events[0]['slot'], 111)
        self.assertEqual(tracker.update({123: dict(row, slot=111)}, '2026-10-23T23:00:02Z'), [])

    def test_easy_reward_delivery_is_counted_once(self):
        row = dict(code='Q071396', title='Easy Reward 1', definitionHash='94e3b2f4d52c89ef506e66ba5404deaec370d85a7a48f695ab96ab76dba66177', group=1, type=1, slot=8)
        tracker = Tracker()
        tracker.update({123: row}, '2026-10-24T01:00:02Z')
        events = tracker.update({123: dict(row, slot=111)}, '2026-10-24T01:00:10Z')
        self.assertEqual([e['state'] for e in events], ['COMPLETION_SIGNAL'])
        self.assertEqual(tracker.update({123: dict(row, slot=111)}, '2026-10-24T01:00:11Z'), [])
        wrong_context = Tracker()
        wrong_context.update({123: dict(row, group=0)}, '2026-10-24T01:00:02Z')
        self.assertEqual(wrong_context.update({123: dict(row, group=0, slot=111)}, '2026-10-24T01:00:10Z')[0]['state'], 'STATE_CHANGED')

    def test_reward_identity_ignores_quantity_and_rejects_short_record(self):
        row = bytearray(424)
        for i in range(6):
            struct.pack_into('<III', row, 0x88 + i * 12, 0xffffffff, 0xffffffff, 255)
        struct.pack_into('<III', row, 0x88, 20, 0xc5081623, 12)
        self.assertEqual(item_rewards(row), {(20, 0xc5081623)})
        struct.pack_into('<I', row, 0x90, 20)
        self.assertEqual(item_rewards(row), {(20, 0xc5081623)})
        with self.assertRaises(ValueError):
            item_rewards(row[:-1])

    def test_store_text_bounds(self):
        name = b'Coupon Reward Manager 2'.ljust(32, b'\0')
        data = struct.pack('<II', 1, 0) + name + name + struct.pack('<I', 1) + b'\0'
        self.assertEqual(store_names(data), ['Coupon Reward Manager 2'])
        for invalid in (data[:-1], data + b'extra', data[:70], b''):
            with self.assertRaises(ValueError):
                store_names(invalid)


if __name__ == '__main__':
    unittest.main()
