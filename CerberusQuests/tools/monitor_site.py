"""Local experimental monitor: validated metadata only, persisted retries, no DLL."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid
from concurrent.futures import ThreadPoolExecutor
from live_reader import Reader, player, journal
from replay_site import catalog, CLIENT_HASH, EDF_HASH, VALIDATED, NoRedirect
from client_profiles import PROFILES
from current_completion import allows, validate_native_path


def utc():
    return datetime.now(timezone.utc).isoformat()


class Tracker:
    def __init__(self, active=None, client_hash=CLIENT_HASH, edf_hash=EDF_HASH):
        self.active = active or {}
        self.client_hash, self.edf_hash = client_hash, edf_hash

    def interrupt(self):
        # A gap never proves removal/delivery; the next observation starts a new run.
        self.active.clear()

    def update(self, entries, timestamp):
        events = []
        def emit(run, state, entry):
            events.append(dict(eventId=str(uuid.uuid4()), runId=run['id'], sequence=run['seq'], occurredAt=timestamp,
                               clientHash=self.client_hash, edfHash=self.edf_hash, state=state, **entry))
            run.update(seq=run['seq'] + 1, entry=entry, state=state)
        keys = {hashlib.sha256(str(obj).encode()).hexdigest(): row for obj, row in entries.items()}
        for key in list(self.active):
            if key not in keys:
                emit(self.active[key], 'REMOVED_UNKNOWN', self.active[key]['entry'])
                del self.active[key]
        for key, entry in keys.items():
            run = self.active.get(key)
            if run and any(entry[field] != run['entry'][field] for field in ('code', 'definitionHash', 'group', 'type')):
                emit(run, 'REMOVED_UNKNOWN', run['entry'])
                del self.active[key]
                run = None
            if run is None:
                run = dict(id=str(uuid.uuid4()), seq=0)
                self.active[key] = run
                emit(run, 'PRESENT', entry)
            elif entry['slot'] != run['entry']['slot']:
                legacy = (self.client_hash == CLIENT_HASH and self.edf_hash == EDF_HASH and
                          (entry['group'], entry['type']) == VALIDATED.get(entry['code']))
                if (run['state'] == 'PRESENT' and 0 <= run['entry']['slot'] < 103 and
                        entry['slot'] - run['entry']['slot'] == 103 and
                        (legacy or allows(entry, self.client_hash, self.edf_hash))):
                    emit(run, 'COMPLETION_SIGNAL', entry)
                else:
                    # Unlisted definitions and other transitions remain indeterminate.
                    emit(run, 'STATE_CHANGED', entry)
        return events


def write_state(path, state):
    encoded = json.dumps(state, ensure_ascii=False, separators=(',', ':')).encode()
    if len(encoded) > 20 * 1024 * 1024:
        raise ValueError('Pending state limit reached; preserve queue and reconnect')
    temp = path.with_suffix('.tmp')
    with temp.open('wb') as stream:
        stream.write(encoded)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


class Sender:
    """One immutable batch in flight; only the polling thread edits the persisted queue."""
    def __init__(self, post):
        self.post = post
        self.executor = ThreadPoolExecutor(max_workers=1)
        self.future = None
        self.next_retry = 0

    def tick(self, state, save, now):
        if self.future is not None and self.future.done():
            try:
                self.future.result()
            except urllib.error.HTTPError as error:
                if error.code in (400, 401, 403, 404, 409, 413):
                    raise ValueError(f'Backend refused sample ({error.code}); check pairing. Queue preserved.') from None
                self.next_retry = now + 5
            except (OSError, TimeoutError):
                self.next_retry = now + 5
            else:
                state['pending'].pop(0)
                save()
            finally:
                self.future = None
        if self.future is None and state['pending'] and now >= self.next_retry:
            self.future = self.executor.submit(self.post, state['pending'][0])

    def close(self):
        # Unacknowledged requests remain on disk and are safely deduplicated on retry.
        self.executor.shutdown(wait=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--client', type=Path, default=Path('F:/RF Cerberus/RF_Online_4gb.bin'))
    parser.add_argument('--url', default='http://127.0.0.1:18084')
    parser.add_argument('--spool-dir', type=Path, help='Private shared outbox; host relay owns the pairing token')
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        raise ValueError('Local monitor accepts only a loopback HTTP origin')
    token = os.environ.get('QUEST_MONITOR_TOKEN', '')
    if not args.spool_dir and (len(token) != 64 or any(ch not in '0123456789abcdef' for ch in token)):
        raise ValueError('Set QUEST_MONITOR_TOKEN; never pass the pairing token as an argument')
    definitions = catalog(args.client.parent, allow_current=True)
    reader = Reader(args.pid, args.client)
    try:
        validate_native_path(reader)
    except BaseException:
        reader.close()
        raise
    out = args.spool_dir or Path(__file__).resolve().parents[2] / 'outputs'
    out.mkdir(parents=True, exist_ok=True)
    path = out / ('collector-state.json' if args.spool_dir else 'monitor-local-' + hashlib.sha256(token.encode()).hexdigest()[:16] + '.json')
    if path.exists() and path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('State exceeds bound')
    state = json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(sequence=0, active={}, pending=[], identity=None)
    # A restart cannot resume observation continuity, even when its network queue survives.
    state['active'] = {}
    tracker = Tracker(client_hash=reader.client_hash, edf_hash=PROFILES[reader.client_hash][0])
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    next_heartbeat = 0
    last = None
    last_poll = None
    read_error = None

    def post(batch):
        if args.spool_dir:
            from spool_site import publish
            publish(args.spool_dir, batch)
            return
        request = urllib.request.Request(args.url.rstrip('/') + '/api/quests/live/ingest',
            json.dumps(batch).encode(), {'Content-Type': 'application/json', 'X-Quest-Token': token}, method='POST')
        with opener.open(request, timeout=2) as response:
            result = json.loads(response.read(4096))
            if result.get('accepted', -1) + result.get('duplicates', -1) != len(batch['events']):
                raise ValueError('Invalid ingestion acknowledgement; queue preserved')

    def save():
        state['active'] = tracker.active
        write_state(path, state)

    def unavailable():
        nonlocal last, next_heartbeat
        changed = bool(tracker.active) or (last is not None and last['status'] != 'UNAVAILABLE')
        tracker.interrupt()
        if last and last['status'] != 'UNAVAILABLE':
            last = dict(last, sequence=state['sequence'], sampledAt=utc(), status='UNAVAILABLE', quests=[])
            state['pending'].append(dict(sample=last, events=[]))
            state['sequence'] += 1
        next_heartbeat = 0
        if changed:
            save()

    sender = Sender(post)
    save()

    try:
        while True:
            now = time.monotonic()
            sender.tick(state, save, now)
            if last_poll is not None and now - last_poll > 1:
                unavailable()
            last_poll = now
            try:
                identity = player(reader)
                entries = journal(reader, definitions)
                after = player(reader)
                if any(identity[key] != after[key] for key in ('name', 'serial', 'identityEpoch')):
                    raise ValueError('Character changed during quest read')
            except (ValueError, OSError) as error:
                if not reader.alive():
                    raise ValueError('Client closed; pair again after entering the character') from None
                if str(error) != read_error:
                    print(f'Reading paused: {error}. No completion inferred across this gap.', flush=True)
                read_error = str(error)
                unavailable()
                time.sleep(0.5)
                continue
            if read_error is not None:
                print('Character reading resumed; observation continuity restarted.', flush=True)
                read_error = None
            anchor = (identity['name'], identity['serial'], identity['identityEpoch'])
            if state['identity'] is not None and list(anchor) != state['identity']:
                raise ValueError('Character/connection changed; pair again, pending events were preserved')
            state['identity'] = list(anchor)
            timestamp = utc()
            events = tracker.update(entries, timestamp)
            if events or time.monotonic() >= next_heartbeat:
                sample = dict(sequence=state['sequence'], sampledAt=timestamp, status='OBSERVED', **identity, quests=list(entries.values()))
                for offset in range(0, max(1, len(events)), 100):
                    state['pending'].append(dict(sample=sample, events=events[offset:offset + 100]))
                state['sequence'] += 1
                save()
                next_heartbeat = time.monotonic() + 5
                last = sample
            if events:
                print(f'{identity["name"]}: level {identity["level"]}, XP {identity["xpPercent"]:.2f}%; {len(entries)} quests, {len(events)} changes, {len(state["pending"])} pending batches', flush=True)
            time.sleep(0.1)
    except (KeyboardInterrupt, ValueError) as error:
        print(f'Monitor stopped: {error}. Pending state preserved.', flush=True)
        unavailable()
        return 1 if isinstance(error, ValueError) else 0
    finally:
        sender.close()
        reader.close()


if __name__ == '__main__':
    raise SystemExit(main())
