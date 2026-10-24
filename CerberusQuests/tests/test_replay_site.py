import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('replay', Path(__file__).resolve().parents[1] / 'tools/replay_site.py')
replay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)


class ReplayTests(unittest.TestCase):
    def entry(self, code='Q071356', slot=8):
        return dict(code=code, title='test', definitionHash='a' * 64, group=1, type=1, slot=slot)

    def test_completion_is_delta_not_final_103_and_retry_ids_are_stable(self):
        samples = [('2026-10-23T20:00:00Z', {'a': self.entry()}),
                   ('2026-10-23T20:00:01Z', {'a': self.entry(slot=111)}),
                   ('2026-10-23T20:00:02Z', {'a': self.entry(slot=111)}),
                   ('2026-10-23T20:00:03Z', {})]
        events = replay.events_from_samples(samples, 'test')
        self.assertEqual([e['state'] for e in events], ['PRESENT', 'COMPLETION_SIGNAL', 'REMOVED_UNKNOWN'])
        self.assertEqual(events, replay.events_from_samples(samples, 'test'))
        self.assertNotEqual(events, replay.events_from_samples(samples, 'another-session'))

    def test_abandon_is_indeterminate_and_repeat_has_new_run(self):
        samples = [('2026-10-23T20:00:00Z', {'a': self.entry('Q071396')}),
                   ('2026-10-23T20:00:01Z', {}),
                   ('2026-10-23T20:00:02Z', {'a': self.entry('Q071396')})]
        events = replay.events_from_samples(samples, 'test')
        self.assertEqual([e['state'] for e in events], ['PRESENT', 'REMOVED_UNKNOWN', 'PRESENT'])
        self.assertNotEqual(events[0]['runId'], events[2]['runId'])

    def test_gap_and_unknown_quest_never_infer_completion(self):
        samples = [('2026-10-23T20:00:00Z', {'a': self.entry()}),
                   ('2026-10-23T20:00:01Z', None),
                   ('2026-10-23T20:00:02Z', {'a': self.entry(slot=111)})]
        self.assertEqual([e['state'] for e in replay.events_from_samples(samples, 'test')], ['PRESENT', 'PRESENT'])
        samples = [('2026-10-23T20:00:00Z', {'a': self.entry('Q999999')}),
                   ('2026-10-23T20:00:02Z', {'a': self.entry('Q999999', 111)})]
        self.assertNotIn('COMPLETION_SIGNAL', [e['state'] for e in replay.events_from_samples(samples, 'test')])

    def test_incomplete_sample_breaks_continuity(self):
        log = '[2026-10-23 20:00:00.000] JOURNAL count=1 identity=UNVERIFIED\n'
        self.assertEqual(replay.snapshots(log, Path('.'), {}), [('2026-10-23T23:00:00+00:00', None)])

    def test_sender_refuses_remote_hosts_and_credentials(self):
        for url in ['https://example.com', 'http://127.0.0.1.evil', 'http://token@localhost', 'http://localhost/path']:
            with self.assertRaises(ValueError):
                replay.send(Path('unused'), url)


if __name__ == '__main__':
    unittest.main()
