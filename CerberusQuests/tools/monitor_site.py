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
from live_reader import Reader, player, journal
from replay_site import catalog, CLIENT_HASH, EDF_HASH, VALIDATED, NoRedirect


def utc():
    return datetime.now(timezone.utc).isoformat()


class Tracker:
    def __init__(self, active=None):
        self.active = active or {}

    def update(self, entries, timestamp):
        events = []
        def emit(run, state, entry):
            events.append(dict(eventId=str(uuid.uuid4()), runId=run['id'], sequence=run['seq'], occurredAt=timestamp,
                               clientHash=CLIENT_HASH, edfHash=EDF_HASH, state=state, **entry))
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
                if run['state'] == 'PRESENT' and entry['slot'] - run['entry']['slot'] == 103 and (entry['group'], entry['type']) == VALIDATED.get(entry['code']):
                    emit(run, 'COMPLETION_SIGNAL', entry)
                else:
                    # shortcut: unvalidated completion variants stay indeterminate until controlled tests.
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--client', type=Path, default=Path('F:/RF Cerberus - Stage Era/RF_Online_4gb.bin'))
    parser.add_argument('--url', default='http://127.0.0.1:18082')
    args = parser.parse_args()
    url = urlsplit(args.url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.username or url.password or url.path not in ('', '/') or url.query or url.fragment:
        raise ValueError('Local monitor accepts only a loopback HTTP origin')
    token = os.environ.get('QUEST_MONITOR_TOKEN', '')
    if len(token) != 64 or any(ch not in '0123456789abcdef' for ch in token):
        raise ValueError('Set QUEST_MONITOR_TOKEN; never pass the pairing token as an argument')
    definitions = catalog(args.client.parent)
    reader = Reader(args.pid, args.client)
    out = Path(__file__).resolve().parents[2] / 'outputs'
    out.mkdir(exist_ok=True)
    path = out / ('monitor-local-' + hashlib.sha256(token.encode()).hexdigest()[:16] + '.json')
    if path.exists() and path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('State exceeds bound')
    state = json.loads(path.read_text(encoding='utf-8')) if path.exists() else dict(sequence=0, active={}, pending=[], identity=None)
    tracker = Tracker(state['active'])
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    next_heartbeat = next_retry = 0
    last = None

    def flush():
        while state['pending']:
            request = urllib.request.Request(args.url.rstrip('/') + '/api/quests/live/ingest',
                json.dumps(state['pending'][0]).encode(), {'Content-Type': 'application/json', 'X-Quest-Token': token}, method='POST')
            with opener.open(request, timeout=2) as response:
                response.read(4096)
            state['pending'].pop(0)
            write_state(path, state)

    try:
        while True:
            identity = player(reader)
            anchor = (identity['name'], identity['serial'], identity['identityEpoch'])
            if state['identity'] is not None and list(anchor) != state['identity']:
                raise ValueError('Character/connection changed; pair again, pending events were preserved')
            entries = journal(reader, definitions)
            after = player(reader)
            if anchor != (after['name'], after['serial'], after['identityEpoch']):
                raise ValueError('Character changed during quest read')
            state['identity'] = list(anchor)
            timestamp = utc()
            events = tracker.update(entries, timestamp)
            if events or time.monotonic() >= next_heartbeat:
                sample = dict(sequence=state['sequence'], sampledAt=timestamp, status='OBSERVED', **identity, quests=list(entries.values()))
                for offset in range(0, max(1, len(events)), 100):
                    state['pending'].append(dict(sample=sample, events=events[offset:offset + 100]))
                state['sequence'] += 1
                state['active'] = tracker.active
                write_state(path, state)
                next_heartbeat = time.monotonic() + 5
                last = sample
            if time.monotonic() >= next_retry:
                try:
                    flush()
                except urllib.error.HTTPError as error:
                    if error.code in (400, 401, 403, 409):
                        print(f'Backend refused sample ({error.code}); stop and inspect pairing. Queue preserved.', flush=True)
                        return 1
                    next_retry = time.monotonic() + 5
                except (OSError, TimeoutError):
                    next_retry = time.monotonic() + 5
            if events:
                print(f'{identity["name"]}: level {identity["level"]}, XP {identity["xpPercent"]:.2f}%; {len(entries)} quests, {len(events)} changes, {len(state["pending"])} pending batches', flush=True)
            time.sleep(0.1)
    except (KeyboardInterrupt, ValueError) as error:
        print(f'Monitor stopped: {error}. Pending state preserved.', flush=True)
        if last:
            sample = dict(last, sequence=state['sequence'], sampledAt=utc(), status='UNAVAILABLE', quests=[])
            state['pending'].append(dict(sample=sample, events=[]))
            state['sequence'] += 1
            state['active'] = {}
            write_state(path, state)
            try:
                flush()
            except (OSError, ValueError):
                pass
    finally:
        reader.close()


if __name__ == '__main__':
    raise SystemExit(main())
