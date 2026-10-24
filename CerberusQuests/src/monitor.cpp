#define _WIN32_WINNT 0x0601
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <wincrypt.h>
#include <conio.h>
#include <cstdio>
#include <cstdarg>
#include <string>
#include <vector>
#include "quest_reader.hpp"
#include "flym_profile.hpp"

static FILE* logFile = nullptr;
static volatile LONG stopping = 0;
static BOOL WINAPI Stop(DWORD) { InterlockedExchange(&stopping, 1); return TRUE; }
static void Log(const char* format, ...) {
    char message[1024]; va_list args;
    va_start(args, format); vsnprintf(message, sizeof(message), format, args); va_end(args);
    SYSTEMTIME t; GetLocalTime(&t);
    printf("[%02u:%02u:%02u.%03u] %s\n", t.wHour, t.wMinute, t.wSecond, t.wMilliseconds, message);
    if (logFile) {
        fprintf(logFile, "[%04u-%02u-%02u %02u:%02u:%02u.%03u] %s\n", t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond,t.wMilliseconds,message);
        fflush(logFile);
    }
}
static std::string HashFile(const std::wstring& path) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return {};
    HCRYPTPROV provider = 0; HCRYPTHASH hash = 0;
    bool ok = CryptAcquireContextW(&provider, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT) &&
              CryptCreateHash(provider, CALG_SHA_256, 0, 0, &hash);
    std::vector<unsigned char> buffer(65536); DWORD got = 0;
    while (ok) {
        if (!ReadFile(file, buffer.data(), static_cast<DWORD>(buffer.size()), &got, nullptr)) { ok = false; break; }
        if (!got) break;
        ok = CryptHashData(hash, buffer.data(), got, 0) != FALSE;
    }
    unsigned char digest[32]; DWORD size = sizeof(digest);
    if (ok) ok = CryptGetHashParam(hash, HP_HASHVAL, digest, &size, 0) && size == 32;
    if (hash) CryptDestroyHash(hash);
    if (provider) CryptReleaseContext(provider, 0);
    CloseHandle(file);
    if (!ok) return {};
    char hex[65]{};
    for (unsigned i = 0; i < 32; ++i) snprintf(hex + i * 2, 3, "%02x", digest[i]);
    return hex;
}

struct RemoteReader {
    HANDLE process;
    bool operator()(uint32_t address, void* out, size_t n) {
        if (address < 0x10000 || !n || n > 65536 || n > UINT32_MAX - address) return false;
        uintptr_t cursor = address, end = cursor + n;
        while (cursor < end) {
            MEMORY_BASIC_INFORMATION info{};
            if (!VirtualQueryEx(process, reinterpret_cast<void*>(cursor), &info, sizeof(info))) return false;
            DWORD p = info.Protect & 0xff;
            if (info.State != MEM_COMMIT || (info.Protect & PAGE_GUARD) ||
                !(p == PAGE_READONLY || p == PAGE_READWRITE || p == PAGE_WRITECOPY ||
                  p == PAGE_EXECUTE_READ || p == PAGE_EXECUTE_READWRITE || p == PAGE_EXECUTE_WRITECOPY)) return false;
            uintptr_t next = reinterpret_cast<uintptr_t>(info.BaseAddress) + info.RegionSize;
            if (next <= cursor) return false;
            cursor = next;
        }
        SIZE_T got = 0;
        return ReadProcessMemory(process, reinterpret_cast<void*>(static_cast<uintptr_t>(address)), out, n, &got) && got == n;
    }
};

static DWORD FindStageClient() {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W entry{}; entry.dwSize = sizeof(entry);
    DWORD pid = 0;
    if (Process32FirstW(snapshot, &entry)) do {
        if (_wcsicmp(entry.szExeFile, L"RF_Online_4gb.bin") == 0) {
            HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, entry.th32ProcessID);
            if (!process) continue;
            std::vector<wchar_t> path(32768); DWORD size = static_cast<DWORD>(path.size());
            bool match = QueryFullProcessImageNameW(process, 0, path.data(), &size) &&
                !_wcsicmp(path.data(), QuestProbe::Profile::ClientPath);
            CloseHandle(process);
            if (!match) continue;
            if (pid) { pid = 0; break; } // refuse ambiguous matching clients
            pid = entry.th32ProcessID;
        }
    } while (Process32NextW(snapshot, &entry));
    CloseHandle(snapshot); return pid;
}

static bool ExpectedBase(DWORD pid) {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
    if (snapshot == INVALID_HANDLE_VALUE) return false;
    MODULEENTRY32W module{}; module.dwSize = sizeof(module);
    bool ok = Module32FirstW(snapshot, &module) && reinterpret_cast<uintptr_t>(module.modBaseAddr) == 0x00400000;
    CloseHandle(snapshot); return ok;
}

static bool SaveCodeEvidence(RemoteReader& read, const std::wstring& folder) {
    uint32_t handler = 0;
    unsigned char prefix[16]{};
    if (!read(0x00A50334, &handler, 4) || handler != 0x00560F80 || !read(handler, prefix, sizeof(prefix))) return false;
    bool nonzero = false;
    for (auto b : prefix) if (b && b != 0xcc) nonzero = true;
    if (!nonzero) return false;
    struct Region { uint32_t address; size_t size; const wchar_t* name; };
    const Region regions[] = {
        {0x00560000, 0x3000, L"code-00560000.bin"},
        {0x00488E00, 0x2000, L"code-00488E00.bin"},
        {0x00493A00, 0x300, L"code-00493A00.bin"},
        {0x00A50300, 0x100, L"vtable-00A50300.bin"},
        {0x00A45B00, 0x80, L"vtable-00A45B00.bin"},
        {0x00A47480, 0x60, L"vtable-00A47480.bin"}
    };
    for (const auto& region : regions) {
        std::vector<unsigned char> data(region.size);
        if (!read(region.address, data.data(), data.size())) return false;
        FILE* f = _wfopen((folder + L"\\" + region.name).c_str(), L"wb");
        if (!f) return false;
        bool ok = fwrite(data.data(), 1, data.size(), f) == data.size();
        if (fclose(f) != 0) ok = false;
        if (!ok) return false;
    }
    Log("HANDLER_EVIDENCE_SAVED: bounded code/vtable regions; ABI and event meaning still UNCONFIRMED");
    return true;
}

int wmain(int argc, wchar_t** argv) {
    if (argc == 2 && wcscmp(argv[1], L"--self-test") == 0) {
        RemoteReader read{GetCurrentProcess()};
        auto page = static_cast<uint32_t*>(VirtualAlloc(nullptr, 4096, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE));
        if (!page) return 1;
        *page = 0x12345678; uint32_t value = 0;
        auto address = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(page));
        bool ok = read(address, &value, 4) && value == *page && !read(0, &value, 4) && !read(0xfffffffe, &value, 4);
        DWORD old = 0;
        ok = ok && VirtualProtect(page, 4096, PAGE_READWRITE | PAGE_GUARD, &old) && !read(address, &value, 4);
        MEMORY_BASIC_INFORMATION info{};
        ok = ok && VirtualQuery(page, &info, sizeof(info)) && (info.Protect & PAGE_GUARD);
        VirtualFree(page, 0, MEM_RELEASE);
        puts(ok ? "PASS: remote reader exact read, invalid address, overflow and guarded page refusal" : "FAIL");
        return ok ? 0 : 1;
    }
    // Hash self-check also exercises the exact production file-hashing path.
    if (argc == 3 && wcscmp(argv[1], L"--hash") == 0) {
        auto hash = HashFile(argv[2]); puts(hash.c_str()); return hash.empty() ? 1 : 0;
    }
    bool snapshot = false, flym = false, journalMode = false;
    for (int i = 1; i < argc; ++i) {
        if (!wcscmp(argv[i], L"--snapshot")) snapshot = true;
        else if (!wcscmp(argv[i], L"--flym")) flym = true;
        else if (!wcscmp(argv[i], L"--journal")) journalMode = true;
        else { puts("Usage: CerberusQuests.exe [--flym | --journal] [--snapshot] | --self-test | --hash FILE"); return 1; }
    }
    if (flym && journalMode) { puts("Choose either --flym or --journal."); return 1; }
    SetConsoleTitleW(L"CerberusQuests - Stage Era diagnostics");
    SetConsoleCtrlHandler(Stop, TRUE);
    std::vector<wchar_t> module(32768); DWORD length = GetModuleFileNameW(nullptr, module.data(), 32768);
    if (!length || length >= 32768) return 1;
    std::wstring dir(module.data(), length); dir.resize(dir.find_last_of(L"\\"));
    std::wstring logRoot = dir + L"\\QuestMonitor-logs";
    if (!CreateDirectoryW(logRoot.c_str(), nullptr) && GetLastError() != ERROR_ALREADY_EXISTS) {
        puts("Could not create QuestMonitor-logs."); return 1;
    }
    SYSTEMTIME t; GetLocalTime(&t); wchar_t name[100];
    swprintf(name, 100, L"\\%04u%02u%02u-%02u%02u%02u-%lu", t.wYear,t.wMonth,t.wDay,t.wHour,t.wMinute,t.wSecond,GetCurrentProcessId());
    std::wstring folder = logRoot + name;
    if (!CreateDirectoryW(folder.c_str(), nullptr)) return 1;
    logFile = _wfopen((folder + L"\\quest-monitor.log").c_str(), L"wb");
    if (!logFile) return 1;
    Log("CerberusQuests 0.1 diagnostic: READ ONLY. No injection, hooks, packets or completion claims.");
    const std::wstring clientPath = QuestProbe::Profile::ClientPath;
    const std::wstring clientDir = clientPath.substr(0, clientPath.find_last_of(L"\\"));
    const std::string expectedClient = QuestProbe::Profile::ClientHash;
    auto clientHash = HashFile(clientPath);
    auto questHash = HashFile(clientDir + L"\\DataTable\\Quest.edf");
    Log("client_sha256=%s", clientHash.c_str()); Log("quest_sha256=%s", questHash.c_str());
    if (clientHash != expectedClient || questHash != QuestProbe::Profile::QuestHash ||
        HashFile(clientDir + L"\\DataTable\\en-gb\\NDQuest.edf") != QuestProbe::Profile::EnglishHash) {
        Log("BUILD_MISMATCH: client or EDF changed/unavailable. Diagnostics disabled. Save this log for review.");
        fclose(logFile); return 2;
    }
    Log("Target: Stage Era 4 GB. Run this diagnostic outside the client folder.");
    Log("Quest target: %s", journalMode ? "journal discovery; definitions require offline EDF verification" : flym ? "Q082010 (5 Young Flym)" : "Q082000");
    Log("Keep this window open. Press Enter here to add a log marker. Ctrl+C stops diagnostics.");
    HANDLE process = nullptr; DWORD pid = 0; unsigned markers = 0;
    DWORD lastAttempt = 0;
    while (!stopping && !process) {
        if (_kbhit()) { int ch = _getch(); if (ch == 13) Log("MANUAL_MARKER %u", ++markers); }
        DWORD candidate = FindStageClient();
        if (candidate && GetTickCount() - lastAttempt >= 5000) {
            lastAttempt = GetTickCount();
            HANDLE handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ | SYNCHRONIZE, FALSE, candidate);
            if (!handle) {
                Log("ACCESS_UNAVAILABLE error=%lu. No protection bypass will be attempted.", GetLastError());
            } else {
                std::vector<wchar_t> path(32768); DWORD size = 32768;
                if (!QueryFullProcessImageNameW(handle, 0, path.data(), &size) || _wcsicmp(path.data(), clientPath.c_str()) ||
                    !ExpectedBase(candidate) || HashFile(clientPath) != expectedClient) {
                    Log("PROCESS_NOT_VALIDATED pid=%lu: path/base/hash. Waiting.", candidate); CloseHandle(handle);
                } else { process = handle; pid = candidate; }
            }
        }
        if (snapshot && !process) { Log("NO_VALIDATED_CLIENT"); fclose(logFile); return 3; }
        Sleep(250);
    }
    if (process) {
        Log("ATTACHED_READ_ONLY pid=%lu base=00400000", pid);
        RemoteReader reader{process}; QuestProbe::Snapshot previous;
        std::vector<QuestProbe::JournalEntry> previousJournal;
        bool first = true, evidence = false; unsigned ticks = 0;
        while (!stopping && WaitForSingleObject(process, 0) == WAIT_TIMEOUT) {
            if (_kbhit()) { int ch = _getch(); if (ch == 13) Log("MANUAL_MARKER %u", ++markers); }
            std::vector<QuestProbe::JournalEntry> journal;
            auto state = journalMode ? QuestProbe::Observe(reader,QuestProbe::TargetCode,QuestProbe::Profile::Record,&journal)
                         : flym ? QuestProbe::Observe(reader, QuestProbe::Flym::Code, QuestProbe::Flym::Record)
                                : QuestProbe::Observe(reader);
            if (first || !(state == previous) || journal != previousJournal) {
                Log("STATE %s slot=%d type=%u flags=%08x record=%08x", state.status.c_str(), state.slot, state.type, state.flags, state.record);
                if(journalMode) {
                    Log("JOURNAL count=%u identity=UNVERIFIED completion=UNCONFIRMED",static_cast<unsigned>(journal.size()));
                    for(unsigned j=0;j<journal.size();++j) {
                        const auto& entry=journal[j];
                        wchar_t filename[80]; swprintf(filename,80,L"\\record-%u-%u.bin",ticks,j);
                        FILE* file=_wfopen((folder+filename).c_str(),L"wb");
                        bool saved=false;
                        if(file) {
                            saved=fwrite(entry.definition.data(),1,entry.definition.size(),file)==entry.definition.size();
                            if(fclose(file)!=0) saved=false;
                        }
                        Log("QUEST group=%u object=%08x slot=%u type=%u flags=%08x code=%08x index=%u record=%08x definition_file=record-%u-%u.bin saved=%d",
                            entry.group,entry.object,entry.data[0x18],entry.data[0x19],QuestProbe::Word(entry.data.data(),0x28),
                            QuestProbe::Word(entry.definition.data(),4),QuestProbe::Word(entry.definition.data(),0),
                            QuestProbe::Word(entry.data.data(),0x10),ticks,j,saved);
                        if(!saved) { Log("CAPTURE_WRITE_FAILED; stopping diagnostic"); InterlockedExchange(&stopping,1); break; }
                    }
                    previousJournal=journal;
                }
                previous = state; first = false;
            }
            if (++ticks == 1 || ticks % 50 == 0) {
                Log("HEARTBEAT state=%s completion=UNCONFIRMED", state.status.c_str());
                uint32_t handler = 0, manager = 0, vtable = 0;
                bool h = reader(0x00A50334, &handler, 4);
                bool m = reader(QuestProbe::ManagerPointer, &manager, 4);
                bool v = m && manager && reader(manager, &vtable, 4);
                Log("CANDIDATES handler_read=%d handler=%08x manager_read=%d manager=%08x vtable_read=%d vtable=%08x", h,handler,m,manager,v,vtable);
                if (!evidence) evidence = SaveCodeEvidence(reader, folder);
            }
            if (ftell(logFile) > 8 * 1024 * 1024) {
                Log("LOG_LIMIT: 8 MiB reached; diagnostic stopped. No completion inferred.");
                break;
            }
            if (snapshot) break;
            Sleep(100);
        }
        CloseHandle(process);
        Log("SESSION_END. Quest absence does NOT confirm completion. Compare with the briefing/reward.");
    }
    fclose(logFile); return 0;
}
