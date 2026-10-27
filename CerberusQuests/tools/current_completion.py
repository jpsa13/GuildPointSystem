"""Checklist completion profile shared with the backend; no reward inference."""
import hashlib
import json
from pathlib import Path

PROFILE = json.loads((Path(__file__).resolve().parents[2] /
    'backend/src/main/resources/quest/completion-current.json').read_text(encoding='utf-8'))


def allows(entry, client_hash, edf_hash):
    return (client_hash == PROFILE['clientHash'] and edf_hash == PROFILE['edfHash']
            and entry['group'] == PROFILE['group'] and entry['type'] == PROFILE['type']
            and PROFILE['quests'].get(entry['code']) == entry['definitionHash'])


def validate_native_path(reader):
    if reader.client_hash != PROFILE['clientHash']:
        return
    for region in PROFILE['nativeRanges']:
        if hashlib.sha256(reader.read(region['address'], region['size'])).hexdigest() != region['sha256']:
            raise ValueError('Quest completion code changed; revalidate the client before monitoring')
