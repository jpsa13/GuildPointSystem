from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from spool_site import publish, relay_one


class SandboxSpoolTests(unittest.TestCase):
    def test_order_idempotency_and_only_delete_after_ack(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            first = {'sample': {'sequence': 0}, 'events': [{'eventId': 'stable'}]}
            last = publish(folder, {'sample': {'sequence': 1}, 'events': []})
            path = publish(folder, first)
            self.assertEqual(publish(folder, first), path)
            post = Mock(side_effect=OSError('offline'))
            with self.assertRaises(OSError):
                relay_one(folder, post)
            self.assertTrue(path.exists())
            post.side_effect = None
            post.return_value = {'accepted': 0, 'duplicates': 1}
            self.assertTrue(relay_one(folder, post))
            self.assertFalse(path.exists())
            self.assertTrue(last.exists())
            post.return_value = {'accepted': 0, 'duplicates': 0}
            self.assertTrue(relay_one(folder, post))
            self.assertFalse(relay_one(folder, post))

    def test_changed_payload_and_bad_ack_keep_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            path = publish(folder, {'sample': {'sequence': 0}, 'events': []})
            with self.assertRaises(ValueError):
                relay_one(folder, lambda _: {'accepted': 1, 'duplicates': 0})
            self.assertTrue(path.exists())
            path.write_text('{}')
            post = Mock()
            with self.assertRaises(ValueError):
                relay_one(folder, post)
            post.assert_not_called()
            self.assertTrue(path.exists())

    def test_oversized_batch_is_rejected_before_publish(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(ValueError):
                publish(Path(temp), {'sample': {'sequence': 0, 'name': 'x' * (1024 * 1024)}, 'events': []})
            self.assertEqual(list(Path(temp).iterdir()), [])
