"""Reproducible smoke test against the dedicated quests simulation preview only."""
import json
from pathlib import Path
import urllib.error
import urllib.request
from collections import Counter

ROOT = Path(__file__).resolve().parents[2]
BASE = 'http://127.0.0.1:18082/api'


def request(path, body=None, jwt=None, paired=None, method=None):
    headers = {'Content-Type': 'application/json'}
    if jwt:
        headers['Authorization'] = 'Bearer ' + jwt
    if paired:
        headers['X-Quest-Token'] = paired
    req = urllib.request.Request(BASE + path, None if body is None else json.dumps(body).encode(), headers,
                                 method=method or ('GET' if body is None else 'POST'))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=20) as result:
        raw = result.read()
        return json.loads(raw) if raw else None


def main():
    first = request('/auth/login', {'email': 'teste@teste.com.br', 'password': '123456'})
    second = request('/auth/login', {'email': 'teste2@teste.com.br', 'password': '123456'})
    evidence = {}
    for owner, filename, expected in [(first, 'quests-npc-completion-simulation.json', 1),
                                      (second, 'quests-npc-abandon-simulation.json', 0)]:
        jwt = owner['token']
        history = request('/quests?day=2026-10-23', jwt=jwt)
        assert history['simulationEnabled'], 'Refusing preview without local simulation gate'
        pair = request('/quests/sessions', {'monitorVersion': 'replay-0.1'}, jwt=jwt)
        try:
            outbox = json.loads((ROOT / 'outputs' / filename).read_text(encoding='utf-8'))
            batch = {'events': outbox['events']}
            accepted = request('/quests/ingest', batch, paired=pair['token'])
            duplicate = request('/quests/ingest', batch, paired=pair['token'])
            assert accepted['accepted'] == len(batch['events'])
            assert duplicate['accepted'] == 0 and duplicate['duplicates'] == len(batch['events'])
            own = request('/quests?day=2026-10-23', jwt=jwt)
            events = [o for o in own['events'] if o['sessionId'] == pair['sessionId']]
            counts = Counter(o['event']['state'] for o in events)
            assert counts['COMPLETION_SIGNAL'] == expected
            assert all(o['source'] == 'SIMULATION' for o in events)
            other = request('/quests?day=2026-10-23&memberId=' + str(owner['memberId']), jwt=(second if owner is first else first)['token'])
            assert not any(o['sessionId'] == pair['sessionId'] for o in other['events'])
            assert not any(s['id'] == pair['sessionId'] for s in other['sessions'])
            assert request('/quests?day=2026-10-24', jwt=jwt)['events'] == []
            evidence[filename] = dict(events=len(events), states=dict(counts), duplicateRetry=duplicate,
                                      ownerIsolation=True, source='SIMULATION')
        finally:
            request('/quests/sessions/' + pair['sessionId'], jwt=jwt, method='DELETE')
        try:
            request('/quests/ingest', batch, paired=pair['token'])
        except urllib.error.HTTPError as error:
            assert error.code == 401
        else:
            raise AssertionError('Revoked token accepted')
    (ROOT / 'outputs/quests-site-smoke.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
