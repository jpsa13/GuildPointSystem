"""Exact client/data combinations inspected locally; unknown updates fail closed."""
from pathlib import Path
import hashlib

LEGACY_CLIENT = '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
LEGACY_EDF = 'fa5e6d236cce98265cae4fc3bc5374ba8560824bbdef94ffb0ed8ec269456e98'
PROFILES = {
    LEGACY_CLIENT: (LEGACY_EDF, 'a2942bbb31e5a4e055c3b174fde762c630f580019906564d1274397269598801'),
    'e0e2b6e7fbdb96d3b4e562621508c1c032157634dc01fb172514b6254a23d6cd': (
        '1fa27ad6434aae151eddc0f8a6c40cc27368293206e935e2bccb9debd3877700',
        'bd9872a34633bf136bea32afbac32d8dda65248888ee786f20fffed657df68f4'),
}


def client_hash(path):
    value = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    if value not in PROFILES:
        raise ValueError('Unsupported client build; validate the update before monitoring')
    return value


def validate_data(build, quest, names):
    if (hashlib.sha256(quest).hexdigest(), hashlib.sha256(names).hexdigest()) != PROFILES.get(build):
        raise ValueError('Unsupported Quest/NDQuest data for this client build')
