"""Offline journal -> minimal simulation outbox. Never reads a running process."""
import argparse
from datetime import datetime, timezone, timedelta
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import urllib.request
from urllib.parse import urlsplit
import uuid

ROOT = Path(__file__).resolve().parents[2]
CLIENT_HASH = '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
EDF_HASH = 'fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98'
TEXT_HASH = 'a2942bbb31e5a4e055c3b174fde762c630f580019906564d1274397269598801'
VALIDATED = {'Q082000': (0, 0), 'Q082010': (0, 0), 'Q071356': (1, 1), 'Q071396': (1, 1)}
LINE = re.compile(r'^\[([^]]+)\] (.*)$')
ENTRY = re.compile(r'QUEST group=(\d+) object=([0-9a-f]+) slot=(\d+) type=(\d+) flags=[0-9a-f]+ code=([0-9a-f]+) index=\d+ record=[0-9a-f]+ definition_file=(record-\d+-\d+\.bin) saved=1$', re.I)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def catalog(client):
    spec = importlib.util.spec_from_file_location('quest_edf', ROOT / 'outputs/cerberus-quest-monitor/edf/analyze_edf.py')
    edf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(edf)
    quest = (client / 'DataTable/Quest.edf').read_bytes()
    names = (client / 'DataTable/en-gb/NDQuest.edf').read_bytes()
    if digest((client / 'RF_Online_4gb.bin').read_bytes()) != CLIENT_HASH or digest(quest) != EDF_HASH or digest(names) != TEXT_HASH:
        raise ValueError('Unsupported build/EDF')
    body = edf.decrypt(quest)
    texts = edf.nd_strings(edf.decrypt(names), 'cp1252')
    result = {}
    for section in edf.sections(body):
        if section['width'] != 424:
            continue
        for i in range(section['count']):
            at = section['start'] + i * 424
            record = body[at:at + 424]
            _, code = struct.unpack_from('<II', record)
            title_index, = struct.unpack_from('<i', record, 0x140)
            title = texts[title_index]['text'].strip() if 0 <= title_index < len(texts) else ''
            # shortcut: invalid/missing title references fall back to code; never guess another string.
            title = ''.join(c for c in title if c.isprintable())[:200]
            key = digest(record)
            if key in result:
                raise ValueError('Ambiguous definition')
            result[key] = (record, f'Q{code & 0xffffff:06X}', title)
    return result


def snapshots(text, records, definitions):
    """A malformed/incomplete sample breaks continuity rather than removing quests."""
    current = None
    samples = []
    expected = None
    when = None
    def flush():
        if current is not None:
            samples.append((when, current if len(current) == expected else None))
    for line in text.splitlines():
        match = LINE.match(line)
        if not match:
            continue
        stamp, message = match.groups()
        instant = datetime.fromisoformat(stamp).replace(tzinfo=timezone(timedelta(hours=-3))).astimezone(timezone.utc).isoformat()
        if message.startswith('STATE '):
            flush()
            current = None
            expected = None
            if not message.startswith('STATE JOURNAL_OBSERVED'):
                samples.append((instant, None))
        elif message.startswith('JOURNAL count='):
            if current is not None:
                raise ValueError('Missing STATE boundary')
            expected = int(message.split('count=')[1].split()[0])
            if expected > 765:
                raise ValueError('Journal too large')
            current, when = {}, instant
        elif message.startswith('QUEST ') and current is not None:
            fields = ENTRY.fullmatch(message)
            if not fields:
                raise ValueError('Malformed journal entry')
            group, obj, slot, kind, binary_code, filename = fields.groups()
            record = (records / filename).read_bytes()
            key = digest(record)
            definition = definitions.get(key)
            if len(record) != 424 or definition is None or definition[0] != record:
                raise ValueError('Definition does not match EDF')
            code = f'Q{int(binary_code, 16) & 0xffffff:06X}'
            if code != definition[1] or struct.unpack_from('<I', record, 4)[0] != int(binary_code, 16):
                raise ValueError('Code mismatch')
            if obj in current:
                raise ValueError('Duplicate object')
            current[obj] = dict(code=code, title=definition[2], definitionHash=key,
                                group=int(group), type=int(kind), slot=int(slot))
    flush()
    return samples


def events_from_samples(samples, identity):
    active, events = {}, []
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, 'CerberusQuests:SIMULATION:' + identity)
    def emit(run, state, instant, entry):
        event = dict(eventId=str(uuid.uuid5(namespace, f'{run["id"]}:{run["seq"]}')),
                     runId=run['id'], sequence=run['seq'], occurredAt=instant,
                     clientHash=CLIENT_HASH, edfHash=EDF_HASH, state=state, **entry)
        events.append(event)
        run['seq'] += 1
        run['entry'] = entry
        run['state'] = state
    for sample_index, (instant, entries) in enumerate(samples):
        if entries is None:
            active.clear()
            continue
        for obj in list(active):
            if obj not in entries:
                emit(active[obj], 'REMOVED_UNKNOWN', instant, active[obj]['entry'])
                del active[obj]
        for obj, entry in entries.items():
            run = active.get(obj)
            same = run and all(run['entry'][k] == entry[k] for k in ('code', 'definitionHash', 'group', 'type'))
            if not same:
                if run:
                    emit(run, 'REMOVED_UNKNOWN', instant, run['entry'])
                run = dict(id=str(uuid.uuid5(namespace, f'{sample_index}:{obj}:{entry["definitionHash"]}')), seq=0)
                active[obj] = run
                emit(run, 'PRESENT', instant, entry)
            elif run['state'] == 'PRESENT' and (entry['group'], entry['type']) == VALIDATED.get(entry['code']) and entry['slot'] - run['entry']['slot'] == 103:
                emit(run, 'COMPLETION_SIGNAL', instant, entry)
            elif entry['slot'] != run['entry']['slot']:
                # An unrecognized change must not become a baseline for a later completion.
                emit(run, 'REMOVED_UNKNOWN', instant, run['entry'])
                del active[obj]
    return events


def send(outbox, base_url):
    url = urlsplit(base_url)
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise ValueError('Simulation sender only accepts a loopback HTTP origin')
    token = os.environ.get('QUEST_SIMULATION_TOKEN', '')
    if not re.fullmatch('[a-f0-9]{64}', token):
        raise ValueError('Set QUEST_SIMULATION_TOKEN; do not put tokens in command-line arguments')
    content = json.loads(outbox.read_text(encoding='utf-8'))
    if content['source'] != 'SIMULATION':
        raise ValueError('Only simulation outboxes are supported')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    for i in range(0, len(content['events']), 100):
        data = json.dumps({'events': content['events'][i:i + 100]}).encode()
        request = urllib.request.Request(base_url.rstrip('/') + '/api/quests/ingest', data,
            headers={'Content-Type': 'application/json', 'X-Quest-Token': token}, method='POST')
        with opener.open(request, timeout=15) as response:
            print(response.read(2048).decode())


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Redirect refused to protect pairing token')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    convert = commands.add_parser('convert')
    convert.add_argument('--log', type=Path, required=True)
    convert.add_argument('--records', type=Path, required=True)
    convert.add_argument('--client', type=Path, default=Path('F:/RF Cerberus - Stage Era'))
    convert.add_argument('--out', type=Path, required=True)
    upload = commands.add_parser('send')
    upload.add_argument('--outbox', type=Path, required=True)
    upload.add_argument('--url', default='http://127.0.0.1:18082')
    args = parser.parse_args()
    if args.command == 'send':
        send(args.outbox, args.url)
        return
    raw = args.log.read_bytes()
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('Log exceeds monitor limit')
    text = raw.decode('utf-8')
    if f'client_sha256={CLIENT_HASH}' not in text or f'quest_sha256={EDF_HASH}' not in text:
        raise ValueError('Missing validated build in log')
    definitions = catalog(args.client)
    samples = snapshots(text, args.records, definitions)
    if not samples:
        raise ValueError('No journal samples found; single-target diagnostics are not journal logs')
    events = events_from_samples(samples, digest(raw))
    # Exclusive creation preserves an existing retry queue and its stable event IDs.
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(dict(source='SIMULATION', monitorVersion='replay-0.1', events=events), stream, ensure_ascii=False, indent=2)
    print(f'{len(definitions)} EDF definitions; {len(events)} SIMULATION events; no memory addresses/binaries exported')


if __name__ == '__main__':
    main()
