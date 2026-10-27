"""Private Sandbox outbox -> fixed loopback quest endpoint. No listener or guest token."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
from monitor_site import write_state
from replay_site import NoRedirect

LIMIT = 1024 * 1024


def publish(folder, batch):
    data = json.dumps(batch, ensure_ascii=False, separators=(',', ':')).encode()
    if len(data) > LIMIT:
        raise ValueError('Sandbox batch exceeds limit')
    digest = hashlib.sha256(data).hexdigest()
    path = folder / f'{batch["sample"]["sequence"]:020d}-{digest}.batch.json'
    if not path.exists():
        if sum(p.stat().st_size for p in folder.glob('*.batch.json')) + len(data) > 20 * LIMIT:
            raise ValueError('Sandbox outbox full; preserve it and restore the host relay')
        write_state(path, batch)
    return path


def relay_one(folder, post):
    paths = sorted(folder.glob('*.batch.json'))
    if not paths:
        return False
    path = paths[0]
    if path.is_symlink() or path.stat().st_size > LIMIT:
        raise ValueError('Invalid Sandbox batch file')
    data = path.read_bytes()
    if len(data) > LIMIT or path.name.split('-', 1)[-1] != hashlib.sha256(data).hexdigest() + '.batch.json':
        raise ValueError('Sandbox batch integrity mismatch')
    batch = json.loads(data)
    if set(batch) != {'sample', 'events'} or not isinstance(batch['events'], list) or len(batch['events']) > 100:
        raise ValueError('Invalid Sandbox batch')
    result = post(data)
    if result.get('accepted', -1) + result.get('duplicates', -1) != len(batch['events']):
        raise ValueError('Invalid host acknowledgement; batch preserved')
    path.unlink()  # Only acknowledged immutable batches leave the outbox.
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--spool-dir', type=Path, required=True)
    args = parser.parse_args()
    token = os.environ.get('QUEST_MONITOR_TOKEN', '')
    if len(token) != 64 or any(ch not in '0123456789abcdef' for ch in token):
        raise ValueError('Set the pairing token in the host environment only')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def post(data):
        request = urllib.request.Request('http://127.0.0.1:18084/api/quests/live/ingest', data,
            {'Content-Type': 'application/json', 'X-Quest-Token': token}, method='POST')
        with opener.open(request, timeout=2) as response:
            return json.loads(response.read(4096))

    while True:
        try:
            if not relay_one(args.spool_dir, post):
                time.sleep(0.2)
        except urllib.error.HTTPError as error:
            if error.code in (400, 401, 403, 404, 409, 413):
                raise ValueError(f'Host refused Sandbox batch ({error.code}); outbox preserved') from None
            time.sleep(5)
        except (OSError, TimeoutError):
            time.sleep(5)


if __name__ == '__main__':
    main()
