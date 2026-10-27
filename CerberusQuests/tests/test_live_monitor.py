import math
from pathlib import Path
import struct
import sys
import unittest
import threading
import tempfile
import json
import urllib.error
from unittest.mock import Mock, patch
import hashlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from live_reader import player, AVATAR_POINTER
from monitor_site import Tracker, Sender, write_state
from client_profiles import PROFILES, LEGACY_CLIENT, validate_data
from extract_coupon_catalog import store_names, item_rewards
from current_completion import PROFILE, validate_native_path


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
        if address == 0x1057dc and size == 4:
            return struct.pack('<f', self.rate)
        raise ValueError('Unexpected memory read')


class LiveMonitorTests(unittest.TestCase):
    def test_confirmed_player_and_invalid_values(self):
        sample = player(FakeReader())
        self.assertEqual((sample['name'], sample['level'], sample['xpPercent']), ('meow', 55, 0))
        self.assertNotIn('avatar', sample)
        self.assertAlmostEqual(player(FakeReader(rate=0.7115))['xpPercent'], 0.7115)
        self.assertAlmostEqual(player(FakeReader(rate=65.75))['xpPercent'], 65.75)
        for reader in (FakeReader(level=0), FakeReader(rate=float('nan')), FakeReader(rate=100.1), FakeReader(name=b'')):
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

    def test_gap_does_not_turn_an_old_observation_into_delivery(self):
        row = dict(code='Q071396', title='Easy Reward 1', definitionHash='a' * 64, group=1, type=1, slot=8)
        tracker = Tracker()
        before = tracker.update({123: row}, '2026-10-26T12:00:00Z')[0]
        tracker.interrupt()
        after = tracker.update({123: dict(row, slot=111)}, '2026-10-26T12:01:00Z')[0]
        self.assertEqual(after['state'], 'PRESENT')
        self.assertNotEqual(before['runId'], after['runId'])

    def test_current_build_preserves_provenance_and_confirms_selected_definition(self):
        build = next(value for value in PROFILES if value != LEGACY_CLIENT)
        tracker = Tracker(client_hash=build, edf_hash=PROFILES[build][0])
        row = dict(code='Q071396', title='Easy Reward 1', definitionHash='44db199b1dcb6eec1760f17a821d1e97f127a388fd52eeede706839921567002', group=1, type=1, slot=8)
        first = tracker.update({123: row}, '2026-10-26T12:00:00Z')[0]
        changed = tracker.update({123: dict(row, slot=111)}, '2026-10-26T12:00:01Z')[0]
        self.assertEqual((first['clientHash'], first['edfHash']), (build, PROFILES[build][0]))
        self.assertEqual(changed['state'], 'COMPLETION_SIGNAL')
        self.assertEqual(tracker.update({}, '2026-10-26T12:00:02Z')[0]['state'], 'REMOVED_UNKNOWN')
        with self.assertRaises(ValueError):
            validate_data(build, b'unknown update', b'unknown text')

    def test_all_selected_definitions_completion_retry_removal_and_gap(self):
        self.assertEqual(len(PROFILE['quests']), 15)
        for code, definition in PROFILE['quests'].items():
            with self.subTest(code=code):
                row = dict(code=code, definitionHash=definition, title=code, group=1, type=1, slot=14)
                tracker = Tracker(client_hash=PROFILE['clientHash'], edf_hash=PROFILE['edfHash'])
                first = tracker.update({123: row}, '2026-10-26T22:00:00Z')[0]
                done = dict(row, slot=117)
                self.assertEqual(tracker.update({123: done}, '2026-10-26T22:00:01Z')[0]['state'], 'COMPLETION_SIGNAL')
                self.assertEqual(tracker.update({123: done}, '2026-10-26T22:00:02Z'), [])
                self.assertEqual(tracker.update({}, '2026-10-26T22:00:03Z')[0]['state'], 'REMOVED_UNKNOWN')
                second = tracker.update({123: row}, '2026-10-26T22:00:04Z')[0]
                self.assertNotEqual(first['runId'], second['runId'])
                self.assertEqual(tracker.update({}, '2026-10-26T22:00:05Z')[0]['state'], 'REMOVED_UNKNOWN')
                tracker.update({123: row}, '2026-10-26T22:00:06Z')
                tracker.interrupt()
                self.assertEqual(tracker.update({123: done}, '2026-10-26T22:00:07Z')[0]['state'], 'PRESENT')
                self.assertEqual(tracker.update({123: dict(row, slot=220)}, '2026-10-26T22:00:08Z')[0]['state'], 'STATE_CHANGED')

    def test_current_completion_rejects_unknown_context_or_delta(self):
        row = dict(code='Q071396', definitionHash=PROFILE['quests']['Q071396'], title='Easy', group=1, type=1, slot=14)
        cases = [(dict(row, **change), PROFILE['clientHash'], PROFILE['edfHash'], 117) for change in
                 ({'code': 'Q334314'}, {'definitionHash': '0' * 64}, {'group': 0}, {'type': 0})]
        cases += [(row, '0' * 64, PROFILE['edfHash'], 117), (row, PROFILE['clientHash'], '0' * 64, 117),
                  (row, PROFILE['clientHash'], PROFILE['edfHash'], 116)]
        for entry, build, edf, slot in cases:
            with self.subTest(entry=entry, build=build, edf=edf, slot=slot):
                tracker = Tracker(client_hash=build, edf_hash=edf)
                tracker.update({123: entry}, '2026-10-26T22:00:00Z')
                self.assertEqual(tracker.update({123: dict(entry, slot=slot)}, '2026-10-26T22:00:01Z')[0]['state'], 'STATE_CHANGED')

    def test_native_guard_refuses_changed_loaded_code(self):
        region = dict(address=1234, size=3, sha256=hashlib.sha256(b'abc').hexdigest())
        reader = Mock(client_hash=PROFILE['clientHash'])
        with patch.dict(PROFILE, nativeRanges=[region]):
            reader.read.return_value = b'abc'
            validate_native_path(reader)
            reader.read.assert_called_once_with(1234, 3)
            reader.read.return_value = b'abd'
            with self.assertRaisesRegex(ValueError, 'code changed'):
                validate_native_path(reader)

    def test_slow_network_does_not_block_observation_and_queue_is_durable(self):
        started, release = threading.Event(), threading.Event()
        def post(batch):
            started.set()
            self.assertTrue(release.wait(5))
        sender = Sender(post)
        try:
            with tempfile.TemporaryDirectory() as folder:
                path = Path(folder) / 'queue.json'
                state = {'pending': [{'events': [{'eventId': 'first'}]}]}
                save = lambda: write_state(path, state)
                save()
                sender.tick(state, save, 0)
                self.assertTrue(started.wait(2))
                # A new observed transition can be persisted while HTTP is still blocked.
                state['pending'].append({'events': [{'eventId': 'second'}]})
                save()
                sender.tick(state, save, 1)
                self.assertEqual(len(json.loads(path.read_text())['pending']), 2)
                release.set()
                sender.future.result(timeout=2)
                sender.tick(state, save, 2)
                self.assertEqual(state['pending'][0]['events'][0]['eventId'], 'second')
                self.assertEqual(len(json.loads(path.read_text())['pending']), 1)
        finally:
            release.set()
            sender.close()

    def test_failed_delivery_retains_same_batch_and_revocation_stops_sender(self):
        batch = {'events': [{'eventId': 'stable'}]}
        state = {'pending': [batch]}
        post = Mock(side_effect=OSError('offline'))
        sender = Sender(post)
        try:
            sender.tick(state, lambda: None, 0)
            with self.assertRaises(OSError):
                sender.future.result(timeout=2)
            sender.tick(state, lambda: None, 1)
            sender.tick(state, lambda: None, 5)
            self.assertEqual(post.call_count, 1)
            self.assertIs(state['pending'][0], batch)
            post.side_effect = urllib.error.HTTPError('http://localhost', 401, 'expired', {}, None)
            sender.tick(state, lambda: None, 6)
            with self.assertRaises(urllib.error.HTTPError):
                sender.future.result(timeout=2)
            with self.assertRaisesRegex(ValueError, '401'):
                sender.tick(state, lambda: None, 7)
            self.assertEqual(state['pending'], [batch])
        finally:
            sender.close()

    def test_store_text_bounds(self):
        name = b'Coupon Reward Manager 2'.ljust(32, b'\0')
        data = struct.pack('<II', 1, 0) + name + name + struct.pack('<I', 1) + b'\0'
        self.assertEqual(store_names(data), ['Coupon Reward Manager 2'])
        for invalid in (data[:-1], data + b'extra', data[:70], b''):
            with self.assertRaises(ValueError):
                store_names(invalid)


if __name__ == '__main__':
    unittest.main()
