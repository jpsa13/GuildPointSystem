"""Bounded, read-only Stage Era reader. Never injects, writes or calls game code."""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
import math
from pathlib import Path
import struct

CLIENT_HASH = '8343dc2afba9537f5c41c713b3af5516d0be75f6ad9a9bdb6ed9722238645379'
AVATAR_POINTER = 0x0233B5F8


class MemoryRegion(c.Structure):
    _fields_ = [('BaseAddress', c.c_void_p), ('AllocationBase', c.c_void_p),
                ('AllocationProtect', w.DWORD), ('PartitionId', w.WORD),
                ('RegionSize', c.c_size_t), ('State', w.DWORD), ('Protect', w.DWORD), ('Type', w.DWORD)]


class Reader:
    def __init__(self, pid, client):
        self.kernel = k = c.WinDLL('kernel32', use_last_error=True)
        k.OpenProcess.argtypes = [w.DWORD, w.BOOL, w.DWORD]
        k.OpenProcess.restype = w.HANDLE
        k.CloseHandle.argtypes = [w.HANDLE]
        k.ReadProcessMemory.argtypes = [w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t)]
        k.ReadProcessMemory.restype = w.BOOL
        k.VirtualQueryEx.argtypes = [w.HANDLE, c.c_void_p, c.POINTER(MemoryRegion), c.c_size_t]
        k.VirtualQueryEx.restype = c.c_size_t
        k.QueryFullProcessImageNameW.argtypes = [w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD)]
        k.GetProcessTimes.argtypes = [w.HANDLE, c.POINTER(w.FILETIME), c.POINTER(w.FILETIME), c.POINTER(w.FILETIME), c.POINTER(w.FILETIME)]
        self.handle = k.OpenProcess(0x410, False, pid)  # QUERY_INFORMATION | VM_READ only
        if not self.handle:
            raise OSError(c.get_last_error(), 'Read access unavailable')
        try:
            path = c.create_unicode_buffer(32768)
            size = w.DWORD(len(path))
            if not k.QueryFullProcessImageNameW(self.handle, 0, path, c.byref(size)) or Path(path.value).resolve() != client.resolve():
                raise ValueError('Process path mismatch')
            if hashlib.sha256(client.read_bytes()).hexdigest() != CLIENT_HASH:
                raise ValueError('Unsupported client build')
            times = [w.FILETIME() for _ in range(4)]
            if not k.GetProcessTimes(self.handle, *(c.byref(value) for value in times)):
                raise ValueError('Process creation time unavailable')
            self.created = (times[0].dwHighDateTime << 32) | times[0].dwLowDateTime
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None

    def read(self, address, size):
        if not self.handle or address < 0x10000 or size < 1 or size > 65536 or address + size > 0x100000000:
            raise ValueError('Invalid bounded read')
        cursor, end = address, address + size
        while cursor < end:
            region = MemoryRegion()
            if not self.kernel.VirtualQueryEx(self.handle, cursor, c.byref(region), c.sizeof(region)):
                raise ValueError('Unreadable region')
            if region.State != 0x1000 or region.Protect & 0x100 or region.Protect & 0xff not in (2, 4, 8, 0x20, 0x40, 0x80):
                raise ValueError('Protected/uncommitted region refused')
            next_address = (region.BaseAddress or 0) + region.RegionSize
            if next_address <= cursor:
                raise ValueError('Invalid region')
            cursor = next_address
        buffer = c.create_string_buffer(size)
        received = c.c_size_t()
        if not self.kernel.ReadProcessMemory(self.handle, address, buffer, size, c.byref(received)) or received.value != size:
            raise ValueError('Incomplete read')
        return buffer.raw

    def uint(self, address):
        return struct.unpack('<I', self.read(address, 4))[0]


def probe(reader):
    avatar = reader.uint(AVATAR_POINTER)
    head = reader.read(avatar, 0x40)
    raw_name = head[0x10:0x30].split(b'\0', 1)[0]
    if not raw_name or any(ch < 32 for ch in raw_name):
        raise ValueError('Invalid name candidate')
    name = raw_name.decode('cp1251', errors='strict')
    levels = {hex(off): reader.uint(avatar + off) for off in (0x1e0, 0x11f0, 0x4024)}
    rate, = struct.unpack('<f', reader.read(avatar + 0x580c, 4))
    if reader.uint(AVATAR_POINTER) != avatar or reader.read(avatar, 0x40) != head:
        raise ValueError('Changing identity; discard sample')
    return dict(name=name, serial=struct.unpack_from('<I', head, 8)[0], vtable=hex(struct.unpack_from('<I', head)[0]),
                levelCandidates=levels, xpCandidatePercent=round(rate * 100, 6) if math.isfinite(rate) and 0 <= rate <= 1 else None)


def player(reader):
    avatar = reader.uint(AVATAR_POINTER)
    head = reader.read(avatar, 0x40)
    name_bytes = head[0x10:0x30]
    if b'\0' not in name_bytes or struct.unpack_from('<I', head)[0] != 0xa41e4c:
        raise ValueError('Unrecognized avatar layout')
    name = name_bytes.split(b'\0', 1)[0].decode('cp1251')
    if not name or len(name) > 32 or not all(ch.isalnum() or ch in '_-' for ch in name):
        raise ValueError('Invalid character name')
    serial = struct.unpack_from('<I', head, 8)[0]
    level = reader.uint(avatar + 0x4024)
    rate, = struct.unpack('<f', reader.read(avatar + 0x580c, 4))
    if not 0 < serial < 0xffffffff or not 1 <= level <= 150 or not math.isfinite(rate) or not 0 <= rate <= 1:
        raise ValueError('Invalid character stats')
    if reader.uint(AVATAR_POINTER) != avatar or reader.read(avatar, 0x40) != head or reader.uint(avatar + 0x4024) != level:
        raise ValueError('Changing character sample')
    epoch = hashlib.sha256(f'{reader.created}:{avatar}:{serial}:{name}'.encode()).hexdigest()
    return dict(name=name, serial=serial, identityEpoch=epoch, level=level, xpPercent=round(rate * 100, 6))


def journal(reader, definitions):
    manager = reader.uint(0x023db0e0)
    manager_data = reader.read(manager, 0x10)
    if struct.unpack_from('<I', manager_data)[0] != 0x00a47494:
        raise ValueError('Unrecognized quest manager')
    address = struct.unpack_from('<I', manager_data, 0xc)[0]
    groups = reader.read(address, 0x34)
    result = {}
    for group in range(3):
        base = 4 + group * 0x10
        items, = struct.unpack_from('<I', groups, base)
        count = groups[base + 4]
        active, = struct.unpack_from('<I', groups, base + 8)
        if not active or not count:
            continue
        pointers = reader.read(items, count * 4)
        for index in range(count):
            item, = struct.unpack_from('<I', pointers, index * 4)
            if not item:
                continue
            obj = reader.uint(item + 0x248)
            if not obj:
                continue
            data = reader.read(obj, 0x30)
            if struct.unpack_from('<I', data)[0] != 0x00a45b1c:
                raise ValueError('Unrecognized quest object')
            record_address = struct.unpack_from('<I', data, 0x10)[0]
            record = reader.read(record_address, 424)
            hash_ = hashlib.sha256(record).hexdigest()
            definition = definitions.get(hash_)
            if definition is None or definition[0] != record:
                raise ValueError('Quest definition mismatch')
            if reader.uint(item + 0x248) != obj or reader.read(obj, 0x30) != data or reader.read(record_address, 424) != record:
                raise ValueError('Changing quest entry')
            if obj in result:
                raise ValueError('Ambiguous quest list')
            result[obj] = dict(code=definition[1], title=definition[2] or definition[1], definitionHash=hash_, group=group, type=data[0x19], slot=data[0x18])
        if reader.read(items, count * 4) != pointers:
            raise ValueError('Changing quest pointers')
    if reader.uint(0x023db0e0) != manager or reader.read(manager, 0x10) != manager_data or reader.read(address, 0x34) != groups:
        raise ValueError('Changing quest manager')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--client', type=Path, default=Path('F:/RF Cerberus - Stage Era/RF_Online_4gb.bin'))
    args = parser.parse_args()
    reader = Reader(args.pid, args.client)
    try:
        print(json.dumps(probe(reader), ensure_ascii=True, indent=2))
    finally:
        reader.close()


if __name__ == '__main__':
    main()
